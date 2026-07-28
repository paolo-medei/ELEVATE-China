import { useMemo, useState } from 'react';
import { useUi } from '../i18n';
import { rampColor, useDiverging, useRamp } from './charts';
import { buildHeatmap } from '../data/simulate';
import { paddockById, RANCH_H, RANCH_W, riverPath } from '../data/ranch';
import { formatLatLon, polygonPath, toLatLon } from '../lib/geo';
import { paddockState, STATE_SEVERITY } from '../lib/status';
import { STATUS_VAR } from '../lib/format';
import { elevationAt, type CowState } from '../data/animals';
import type { Dataset, Flight, HerdStep, Pt } from '../data/types';

export type MapLayer = 'status' | 'pressure' | 'biomass' | 'utilisation' | 'rest' | 'none';

const VB_W = 1000;
const SCALE = VB_W / RANCH_W;
const VB_H = Math.round(RANCH_H * SCALE);

const px = (p: Pt): Pt => ({ x: p.x * SCALE, y: p.y * SCALE });

const smoothPath = (pts: Pt[]) => {
  if (pts.length < 2) return '';
  const p = pts.map(px);
  let d = `M${p[0].x} ${p[0].y}`;
  for (let i = 1; i < p.length; i++) {
    const prev = p[i - 1];
    const cur = p[i];
    const cx = (prev.x + cur.x) / 2;
    d += ` Q${prev.x} ${prev.y} ${cx} ${(prev.y + cur.y) / 2}`;
    if (i === p.length - 1) d += ` L${cur.x} ${cur.y}`;
  }
  return d;
};

/** Lawnmower survey pattern over the paddocks a mission actually covered. */
function flightPath(flight: Flight): string {
  if (!flight.paddockIds.length) return '';
  const polys = flight.paddockIds.map((id) => paddockById.get(id)!.polygon.map(px));
  const xs = polys.flat().map((p) => p.x);
  const ys = polys.flat().map((p) => p.y);
  const minX = Math.min(...xs) + 6;
  const maxX = Math.max(...xs) - 6;
  const minY = Math.min(...ys) + 8;
  const maxY = Math.max(...ys) - 8;
  const passes = Math.max(3, Math.round((maxY - minY) / 22));
  const step = (maxY - minY) / passes;
  let d = `M${minX} ${minY}`;
  for (let i = 0; i <= passes; i++) {
    const y = minY + i * step;
    const leftFirst = i % 2 === 0;
    d += ` L${leftFirst ? maxX : minX} ${y}`;
    if (i < passes) d += ` L${leftFirst ? maxX : minX} ${y + step}`;
  }
  return d;
}

export function RanchMap({
  data,
  day,
  hour,
  layer,
  showTrails,
  minimal = false,
  cowStates,
  basemap = 'plain',
  focus,
  selectedCow,
  onSelectCow,
  flight,
  selectedPaddock,
  onSelectPaddock,
  selectedHerd,
  onSelectHerd,
}: {
  data: Dataset;
  day: number;
  hour: number;
  layer: MapLayer;
  showTrails: boolean;
  /** simple view: drop the labels and readouts that only a specialist wants */
  minimal?: boolean;
  /** when given, every animal is drawn individually instead of one dot per herd */
  cowStates?: CowState[];
  basemap?: 'plain' | 'satellite';
  /** frame this rectangle (ranch metres) instead of the whole ranch */
  focus?: { minX: number; minY: number; maxX: number; maxY: number };
  selectedCow?: string | null;
  onSelectCow?: (id: string | null) => void;
  flight?: Flight;
  selectedPaddock: string | null;
  onSelectPaddock: (id: string | null) => void;
  selectedHerd: string | null;
  onSelectHerd: (id: string | null) => void;
}) {
  const { t, b, lang } = useUi();
  const ramp = useRamp();
  const diverging = useDiverging();
  const [hoverPaddock, setHoverPaddock] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number; ll: string } | null>(null);

  const heat = useMemo(() => {
    if (layer !== 'pressure') return null;
    const from = Math.max(0, day - 6);
    return buildHeatmap(
      data.steps.filter((s) => s.day >= from && s.day <= day && (s.day < day || s.hour <= hour)),
      200,
    );
  }, [data.steps, day, hour, layer]);

  const pdByPaddock = useMemo(() => {
    const m = new Map<string, (typeof data.paddockDays)[number]>();
    for (const pd of data.paddockDays) if (pd.day === day) m.set(pd.paddockId, pd);
    return m;
  }, [data.paddockDays, day]);

  const currentSteps = data.stepIndex[day][hour];

  const trails = useMemo(() => {
    if (!showTrails) return new Map<string, HerdStep[]>();
    const m = new Map<string, HerdStep[]>();
    for (const s of data.steps) {
      if (s.day !== day || s.hour > hour) continue;
      const arr = m.get(s.herdId) ?? [];
      arr.push(s);
      m.set(s.herdId, arr);
    }
    return m;
  }, [data.steps, day, hour, showTrails]);

  const paddockFill = (paddockId: string) => {
    const pd = pdByPaddock.get(paddockId);
    const p = paddockById.get(paddockId)!;
    if (!pd || layer === 'none' || layer === 'pressure') return 'var(--land)';
    if (layer === 'status') {
      const st = paddockState(pd);
      return st === 'resting' ? 'var(--land)' : STATUS_VAR[STATE_SEVERITY[st]];
    }
    if (layer === 'biomass') return rampColor(ramp, pd.biomass / p.biomassCeiling);
    if (layer === 'rest') return rampColor(ramp, Math.min(1, pd.restDays / 30));
    // utilisation: the full forage allowance (1.0) is the neutral midpoint
    return diverging(1 - pd.utilization);
  };

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = vb.x + ((e.clientX - r.left) / r.width) * vb.w;
    const y = vb.y + ((e.clientY - r.top) / r.height) * vb.h;
    const ll = toLatLon(
      { x: x / SCALE, y: y / SCALE },
      data.meta.origin,
      data.meta.metresPerDegLat,
      data.meta.metresPerDegLon,
    );
    setCursor({
      x,
      y,
      ll: `${formatLatLon(ll)}  ·  ${elevationAt({ x: x / SCALE, y: y / SCALE })} m`,
    });
  };

  const vb = (() => {
    if (!focus) return { x: 0, y: 0, w: VB_W, h: VB_H };
    const cx = ((focus.minX + focus.maxX) / 2) * SCALE;
    const cy = ((focus.minY + focus.maxY) / 2) * SCALE;
    // grow the short side so the frame matches the map's aspect and nothing stretches
    const aspect = VB_W / VB_H;
    let w = (focus.maxX - focus.minX) * SCALE;
    let h = (focus.maxY - focus.minY) * SCALE;
    if (w / h > aspect) h = w / aspect;
    else w = h * aspect;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  })();
  /** zoom factor: multiply sizes by this so labels and dots keep their screen size */
  const k = vb.w / VB_W;

  const hoveredPd = hoverPaddock ? pdByPaddock.get(hoverPaddock) : null;
  const hoveredPaddock = hoverPaddock ? paddockById.get(hoverPaddock)! : null;

  return (
    <div className="map-shell">
      <svg
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        role="img"
        aria-label={t('mapTitle')}
        onMouseMove={onMove}
        onMouseLeave={() => setCursor(null)}
      >
        <defs>
          <pattern id="steppe" width="14" height="14" patternUnits="userSpaceOnUse">
            <rect width="14" height="14" fill="var(--land)" />
            <circle cx="3" cy="4" r="0.7" fill="var(--land-line)" opacity="0.9" />
            <circle cx="10" cy="10" r="0.7" fill="var(--land-line)" opacity="0.6" />
          </pattern>
          <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
          <filter id="terrainA" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.016" numOctaves="5" seed="11" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.29  0 0 0 0 0.33  0 0 0 0 0.17  0.85 0 0 0 0.05"
            />
          </filter>
          <filter id="terrainB" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.05 0.07" numOctaves="3" seed="4" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.45  0 0 0 0 0.41  0 0 0 0 0.24  0.55 0 0 0 0"
            />
          </filter>
          <filter id="heatBlur" x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <clipPath id="ranchClip">
            <rect x="0" y="0" width={VB_W} height={VB_H} />
          </clipPath>
        </defs>

        {basemap === 'satellite' ? (
          <g>
            <rect width={VB_W} height={VB_H} fill="#3d4326" />
            <rect width={VB_W} height={VB_H} filter="url(#terrainA)" />
            <rect width={VB_W} height={VB_H} filter="url(#terrainB)" opacity={0.5} />
          </g>
        ) : (
          <rect width={VB_W} height={VB_H} fill="url(#steppe)" />
        )}

        {/* relief hints */}
        <g opacity="0.55" fill="none" stroke="var(--land-line)" strokeWidth="1">
          <ellipse cx="200" cy="130" rx="130" ry="66" />
          <ellipse cx="200" cy="130" rx="88" ry="42" />
          <ellipse cx="200" cy="130" rx="46" ry="21" />
          <ellipse cx="800" cy="330" rx="160" ry="74" />
          <ellipse cx="800" cy="330" rx="108" ry="47" />
          <ellipse cx="500" cy="540" rx="200" ry="52" />
          <ellipse cx="640" cy="180" rx="90" ry="38" />
        </g>

        {/* grazing-pressure heat surface */}
        {heat && (
          <g opacity="0.9" filter="url(#heatBlur)" clipPath="url(#ranchClip)">
            {heat.values.map((v, i) => {
              if (v < 0.02) return null;
              const c = i % heat.cols;
              const r = Math.floor(i / heat.cols);
              const s = heat.cellM * SCALE;
              return (
                <rect
                  key={i}
                  x={c * s}
                  y={r * s}
                  width={s}
                  height={s}
                  fill={rampColor(ramp, Math.pow(v, 0.55))}
                  opacity={Math.min(1, 0.25 + v * 1.6)}
                />
              );
            })}
          </g>
        )}

        {/* paddocks */}
        <g>
          {data.paddocks.map((p) => {
            const selected = selectedPaddock === p.id;
            const active = selected || hoverPaddock === p.id;
            return (
              <path
                key={p.id}
                className="paddock"
                d={polygonPath(p.polygon, px)}
                fill={layer === 'pressure' ? 'transparent' : paddockFill(p.id)}
                fillOpacity={
                  layer === 'none' || layer === 'pressure' ? 0.15 : layer === 'status' ? 0.45 : 0.82
                }
                stroke={active ? 'var(--text-primary)' : 'var(--land-line)'}
                strokeWidth={active ? 2 : 1.4}
                strokeDasharray={active ? undefined : '7 5'}
                onMouseEnter={() => setHoverPaddock(p.id)}
                onMouseLeave={() => setHoverPaddock(null)}
                onClick={() => onSelectPaddock(selected ? null : p.id)}
              />
            );
          })}
        </g>

        {/* river */}
        <path
          d={smoothPath(riverPath)}
          fill="none"
          stroke="var(--seq-400)"
          strokeWidth={5}
          strokeOpacity={0.5}
          strokeLinecap="round"
        />

        {/* flight path */}
        {flight && flight.paddockIds.length > 0 && (
          <g>
            <path
              d={flightPath(flight)}
              fill="none"
              stroke="var(--series-4)"
              strokeWidth={1.6}
              strokeDasharray="4 4"
              strokeOpacity={0.9}
            />
          </g>
        )}

        {/* water points */}
        {data.water.map((w) => {
          const q = px(w.at);
          return (
            <g key={w.id}>
              <circle
                cx={q.x}
                cy={q.y}
                r={(minimal ? 10 : 7) * k}
                fill="var(--seq-400)"
                fillOpacity={0.22}
              />
              <circle
                cx={q.x}
                cy={q.y}
                r={(minimal ? 5 : 3.4) * k}
                fill="var(--seq-400)"
                stroke="var(--surface-1)"
                strokeWidth={(minimal ? 2 : 1) * k}
              />
              {!minimal && (
                <text x={q.x} y={q.y + 17} textAnchor="middle" className="paddock-sublabel">
                  {b(w.name)}
                </text>
              )}
            </g>
          );
        })}

        {/* landmarks */}
        {!minimal && data.landmarks.map((l) => {
          const q = px(l.at);
          return (
            <g key={l.id}>
              <rect
                x={q.x - 4}
                y={q.y - 4}
                width={8}
                height={8}
                rx={2}
                fill="var(--surface-1)"
                stroke="var(--text-secondary)"
                strokeWidth={1.4}
                transform={l.kind === 'dronePad' ? `rotate(45 ${q.x} ${q.y})` : undefined}
              />
              {!minimal && (
                <text x={q.x + 8} y={q.y + 3.5} className="paddock-sublabel">
                  {b(l.name)}
                </text>
              )}
            </g>
          );
        })}

        {/* paddock labels */}
        {data.paddocks.map((p) => {
          const c = px(p.centroid);
          const pd = pdByPaddock.get(p.id);
          return (
            <g key={`lbl-${p.id}`} pointerEvents="none">
              <text
                x={c.x}
                y={c.y - 4 * k}
                textAnchor="middle"
                className="paddock-label"
                style={{ fontSize: 11 * k, strokeWidth: 3 * k }}
              >
                {b(p.name)}
              </text>
              {!minimal && (
              <text x={c.x} y={c.y + 9} textAnchor="middle" className="paddock-sublabel">
                {layer === 'status' && pd
                  ? t(`state_${paddockState(pd)}` as 'state_ok')
                  : layer === 'biomass' && pd
                  ? `${pd.biomass} kg/ha`
                  : layer === 'utilisation' && pd
                    ? `${Math.round(pd.utilization * 100)}%`
                    : layer === 'rest' && pd
                      ? `${pd.restDays} d`
                      : `${p.areaHa} ${t('hectares')}`}
              </text>
              )}
            </g>
          );
        })}

        {/* herd trails */}
        {showTrails &&
          [...trails.entries()].map(([herdId, steps]) => {
            const herd = data.herds.find((h) => h.id === herdId)!;
            const d = steps
              .map((s, i) => {
                const q = px(s.at);
                return `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
              })
              .join(' ');
            return (
              <path
                key={herdId}
                d={d}
                fill="none"
                stroke={`var(--series-${herd.color.slice(1)})`}
                strokeWidth={1.6}
                strokeOpacity={selectedHerd && selectedHerd !== herdId ? 0.18 : 0.55}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

        {/* herds — one dot per animal when a cow snapshot is supplied */}
        {cowStates ? (
          cowStates.map((c) => {
            const q = px(c.at);
            const sel = selectedCow === c.cow.id;
            const colour = !c.detected
              ? 'var(--critical)'
              : c.confidencePct >= 95
                ? 'var(--good)'
                : c.confidencePct >= 85
                  ? 'var(--warning)'
                  : 'var(--serious)';
            return (
              <g key={c.cow.id} onClick={() => onSelectCow?.(sel ? null : c.cow.id)}>
                <circle
                  cx={q.x}
                  cy={q.y}
                  r={(sel ? 5 : 2.4) * k}
                  fill={c.detected ? colour : 'none'}
                  stroke={
                    !c.detected
                      ? 'var(--critical)'
                      : sel
                        ? 'var(--text-primary)'
                        : 'rgba(0,0,0,0.45)'
                  }
                  strokeWidth={(sel ? 2 : c.detected ? 0.5 : 1.2) * k}
                  style={{ cursor: 'pointer' }}
                />
                {(sel || c.flags.includes('sick') || c.flags.includes('notFound')) && (
                  <circle
                    cx={q.x}
                    cy={q.y}
                    r={(sel ? 11 : 6) * k}
                    fill="none"
                    stroke={colour}
                    strokeWidth={1.4 * k}
                    strokeDasharray={`${2 * k} ${2 * k}`}
                  />
                )}
              </g>
            );
          })
        ) : (
          <>
        {currentSteps.map((s) => {
          const herd = data.herds.find((h) => h.id === s.herdId)!;
          const q = px(s.at);
          const color = `var(--series-${herd.color.slice(1)})`;
          const r = 4 + Math.sqrt(herd.head) * 0.42;
          const dim = selectedHerd && selectedHerd !== s.herdId;
          return (
            <g
              key={s.herdId}
              opacity={dim ? 0.35 : 1}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectHerd(selectedHerd === s.herdId ? null : s.herdId)}
            >
              <circle
                cx={q.x}
                cy={q.y}
                r={(s.spreadM * SCALE) / 2}
                fill={color}
                fillOpacity={0.1}
                stroke={color}
                strokeOpacity={0.35}
                strokeWidth={1}
                strokeDasharray="3 3"
                filter={s.offPaddock ? 'url(#soft)' : undefined}
              />
              <circle
                cx={q.x}
                cy={q.y}
                r={minimal ? Math.max(11, r) : r}
                fill={color}
                stroke="var(--surface-1)"
                strokeWidth={2}
              />
              {s.offPaddock && (
                <circle
                  cx={q.x}
                  cy={q.y}
                  r={r + 5}
                  fill="none"
                  stroke="var(--critical)"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                />
              )}
              {minimal ? (
                <text
                  x={q.x}
                  y={q.y + 4}
                  textAnchor="middle"
                  style={{ fill: '#fff', fontSize: 12, fontWeight: 700 }}
                >
                  {herd.id.slice(1)}
                </text>
              ) : (
                <text
                  x={q.x}
                  y={q.y - r - 5}
                  textAnchor="middle"
                  style={{ fill: 'var(--text-primary)', fontSize: 10.5, fontWeight: 650 }}
                >
                  {herd.head}
                </text>
              )}
            </g>
          );
        })}

          </>
        )}
        {/* scale bar */}
        <g transform={`translate(${vb.x + vb.w - 100 - 30 * k} ${vb.y + vb.h - 26 * k})`}>
          <line x1={0} x2={100} y1={0} y2={0} stroke="var(--text-secondary)" strokeWidth={2 * k} />
          <line x1={0} x2={0} y1={-4 * k} y2={4 * k} stroke="var(--text-secondary)" strokeWidth={2 * k} />
          <line
            x1={100}
            x2={100}
            y1={-4 * k}
            y2={4 * k}
            stroke="var(--text-secondary)"
            strokeWidth={2 * k}
          />
          <text
            x={50}
            y={-7 * k}
            textAnchor="middle"
            className="paddock-sublabel"
            style={{ fontSize: 9.5 * k, strokeWidth: 3 * k }}
          >
            1 km
          </text>
        </g>
        <g transform={`translate(${vb.x + 28 * k} ${vb.y + 40 * k}) scale(${k})`}>
          <path d="M0 -14 L5 6 L0 1 L-5 6 Z" fill="var(--text-secondary)" />
          <text y={20} textAnchor="middle" className="paddock-sublabel">
            N
          </text>
        </g>
      </svg>

      <div className="map-overlay tr">
        {cursor && !minimal && <div className="map-chip">{cursor.ll}</div>}
        {hoveredPaddock && (
          <div className="map-chip">
            <strong>
              {hoveredPaddock.code} · {b(hoveredPaddock.name)}
            </strong>
            <br />
            {hoveredPaddock.areaHa} {t('hectares')} ·{' '}
            {t(
              hoveredPaddock.soil === 'meadow'
                ? 'soilMeadow'
                : hoveredPaddock.soil === 'typical'
                  ? 'soilTypical'
                  : 'soilSandy',
            )}
            {hoveredPd && (
              <>
                <br />
                {t('biomass')} <strong>{hoveredPd.biomass}</strong> kg/ha · {t('utilisation')}{' '}
                <strong>{Math.round(hoveredPd.utilization * 100)}%</strong>
                <br />
                {t('restDays')} <strong>{hoveredPd.restDays}</strong>
                {hoveredPd.stockingAuHa > 0 && (
                  <>
                    {' '}
                    · {t('stocking')} <strong>{hoveredPd.stockingAuHa.toFixed(2)}</strong> AU/ha
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="map-overlay bl">
        <div className="map-chip">
          {layer === 'status' ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {(['outOfGrass', 'watch', 'ok', 'resting'] as const).map((st) => (
                <span key={st} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span
                    className="legend-swatch"
                    style={{
                      background: st === 'resting' ? 'var(--land)' : STATUS_VAR[STATE_SEVERITY[st]],
                      border: st === 'resting' ? '1px solid var(--border-strong)' : undefined,
                    }}
                    aria-hidden="true"
                  />
                  {t(`state_${st}` as 'state_ok')}
                </span>
              ))}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span
                  className="legend-swatch"
                  style={{ background: 'var(--seq-400)', borderRadius: '50%' }}
                  aria-hidden="true"
                />
                {t('water')}
              </span>
            </span>
          ) : layer === 'utilisation' ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{t('overUsed')}</span>
              <span
                style={{
                  width: 96,
                  height: 8,
                  borderRadius: 4,
                  background: `linear-gradient(90deg, ${diverging(-1)}, ${diverging(0)}, ${diverging(1)})`,
                }}
              />
              <span>{t('underUsed')}</span>
            </span>
          ) : layer === 'none' ? (
            <span>{lang === 'zh' ? '点击草场查看详情' : 'Click a paddock for detail'}</span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{t('legendLow')}</span>
              <span
                style={{
                  width: 96,
                  height: 8,
                  borderRadius: 4,
                  background: `linear-gradient(90deg, ${rampColor(ramp, 0)}, ${rampColor(ramp, 0.5)}, ${rampColor(ramp, 1)})`,
                }}
              />
              <span>{t('legendHigh')}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
