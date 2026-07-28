import { useMemo, useState } from 'react';
import { useUi } from '../i18n';
import { cowSeverity, elevationAt, type CowState } from '../data/animals';
import { landmarks, paddockById, RANCH_H, RANCH_W, water } from '../data/ranch';
import { formatLatLon, polygonPath, toLatLon } from '../lib/geo';
import { paddockState, STATE_SEVERITY } from '../lib/status';
import { SERIES_VAR, STATUS_VAR } from '../lib/format';
import type { Dataset, Pt } from '../data/types';

const VB_W = 1000;
const SCALE = VB_W / RANCH_W;
const VB_H = Math.round(RANCH_H * SCALE);

const px = (p: Pt): Pt => ({ x: p.x * SCALE, y: p.y * SCALE });

const line = (pts: Pt[]) =>
  pts
    .map(px)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

/* ------------------------------------------------------------------ *
 * Terrain of the study area: the Assy river runs west to east across the
 * plateau into the Bartogai reservoir; the Turgen gorge cuts the north-west
 * corner; the Zailiysky Alatau ridges close the south.
 * ------------------------------------------------------------------ */

const ASSY_RIVER: Pt[] = [
  { x: -200, y: 4180 },
  { x: 1500, y: 4460 },
  { x: 2900, y: 4380 },
  { x: 4300, y: 4890 },
  { x: 5900, y: 5150 },
  { x: 7600, y: 5320 },
  { x: 9100, y: 5460 },
  { x: 10900, y: 5620 },
];

const TURGEN_GORGE: Pt[] = [
  { x: -200, y: 1500 },
  { x: 900, y: 1180 },
  { x: 1800, y: 620 },
  { x: 2500, y: -200 },
];

const RESERVOIR: Pt[] = [
  { x: 11200, y: 5150 },
  { x: 10620, y: 5560 },
  { x: 10480, y: 6060 },
  { x: 10780, y: 6620 },
  { x: 11200, y: 6700 },
];

/** ridge crests drawn as chevron runs, the way a hiking map shows relief */
const RIDGES: { pts: Pt[]; teeth: number }[] = [
  { pts: [{ x: -100, y: 6250 }, { x: 2200, y: 6020 }, { x: 4600, y: 6180 }, { x: 7000, y: 5980 }], teeth: 13 },
  { pts: [{ x: 700, y: 300 }, { x: 2600, y: 250 }, { x: 4200, y: 520 }], teeth: 8 },
  { pts: [{ x: 8100, y: 900 }, { x: 9600, y: 700 }, { x: 10900, y: 1050 }], teeth: 7 },
];

const TRACK: Pt[] = [
  { x: 2100, y: 300 },
  { x: 3200, y: 1600 },
  { x: 4600, y: 2600 },
  { x: 5100, y: 4100 },
  { x: 6400, y: 4800 },
  { x: 8200, y: 5100 },
  { x: 9700, y: 5350 },
];

function ridgePath(pts: Pt[], teeth: number) {
  const p = pts.map(px);
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const t = i / (teeth - 1);
    const seg = t * (p.length - 1);
    const i0 = Math.min(p.length - 2, Math.floor(seg));
    const f = seg - i0;
    const x = p[i0].x + (p[i0 + 1].x - p[i0].x) * f;
    const y = p[i0].y + (p[i0 + 1].y - p[i0].y) * f;
    d += `M${x - 9} ${y + 5} L${x} ${y - 5} L${x + 9} ${y + 5} `;
  }
  return d;
}

export type HerdMapProps = {
  data: Dataset;
  day: number;
  hour: number;
  /** null = all herds as one marker each; a herd id = every animal in that herd */
  herdFilter: string | null;
  cowStates: CowState[];
  /** animals to always call out by name, wherever the map is zoomed */
  highlight?: CowState[];
  selectedCow?: string | null;
  onSelectCow?: (id: string | null) => void;
  height?: number;
};

export function HerdMap({
  data,
  day,
  hour,
  herdFilter,
  cowStates,
  highlight = [],
  selectedCow,
  onSelectCow,
}: HerdMapProps) {
  const { t, b } = useUi();
  const [cursor, setCursor] = useState<string | null>(null);
  const [hoverArea, setHoverArea] = useState<string | null>(null);

  const areaState = useMemo(() => {
    const m = new Map<string, ReturnType<typeof paddockState>>();
    for (const pd of data.paddockDays) if (pd.day === day) m.set(pd.paddockId, paddockState(pd));
    return m;
  }, [data.paddockDays, day]);

  const steps = data.stepIndex[day][hour];

  // one herd selected → frame it, so individual animals are readable
  const vb = useMemo(() => {
    if (!herdFilter || cowStates.length === 0) return { x: 0, y: 0, w: VB_W, h: VB_H };
    const xs = cowStates.map((c) => c.at.x);
    const ys = cowStates.map((c) => c.at.y);
    const pad = 400;
    const cx = ((Math.min(...xs) + Math.max(...xs)) / 2) * SCALE;
    const cy = ((Math.min(...ys) + Math.max(...ys)) / 2) * SCALE;
    let w = (Math.max(...xs) - Math.min(...xs) + pad * 2) * SCALE;
    let h = (Math.max(...ys) - Math.min(...ys) + pad * 2) * SCALE;
    const aspect = VB_W / VB_H;
    if (w / h > aspect) h = w / aspect;
    else w = h * aspect;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }, [herdFilter, cowStates]);

  const k = vb.w / VB_W;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = vb.x + ((e.clientX - r.left) / r.width) * vb.w;
    const y = vb.y + ((e.clientY - r.top) / r.height) * vb.h;
    const at = { x: x / SCALE, y: y / SCALE };
    const ll = toLatLon(at, data.meta.origin, data.meta.metresPerDegLat, data.meta.metresPerDegLon);
    setCursor(`${formatLatLon(ll)} · ${elevationAt(at)} m`);
  };

  const areaFill = (id: string) => {
    const st = areaState.get(id);
    if (!st) return 'var(--land)';
    if (st === 'resting') return '#4e6b3a';
    return st === 'ok' ? '#4e6b3a' : st === 'watch' ? '#9c8a2e' : '#8f3b2f';
  };

  return (
    <div className="map-shell">
      <svg
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        role="img"
        aria-label={t('bigWhere')}
        onMouseMove={onMove}
        onMouseLeave={() => setCursor(null)}
      >
        <defs>
          <filter id="ground" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="5" seed="9" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.26  0 0 0 0 0.30  0 0 0 0 0.15  0.75 0 0 0 0.06"
            />
          </filter>
          <filter id="grain" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="3" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.55  0 0 0 0 0.52  0 0 0 0 0.34  0.4 0 0 0 0"
            />
          </filter>
          <filter id="water" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.03 0.06" numOctaves="3" seed="6" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.12  0 0 0 0 0.28  0 0 0 0 0.45  0.5 0 0 0 0.55"
            />
          </filter>
        </defs>

        {/* ground */}
        <rect x={0} y={0} width={VB_W} height={VB_H} fill="#41502c" />
        <rect x={0} y={0} width={VB_W} height={VB_H} filter="url(#ground)" />
        <rect x={0} y={0} width={VB_W} height={VB_H} filter="url(#grain)" opacity={0.45} />

        {/* grazing areas, coloured by how much grass they have left */}
        {data.paddocks.map((p) => (
          <path
            key={p.id}
            d={polygonPath(p.polygon, px)}
            fill={areaFill(p.id)}
            fillOpacity={hoverArea === p.id ? 0.72 : 0.5}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={1.1 * k}
            strokeDasharray={`${5 * k} ${4 * k}`}
            onMouseEnter={() => setHoverArea(p.id)}
            onMouseLeave={() => setHoverArea(null)}
          />
        ))}

        {/* relief */}
        {RIDGES.map((r, i) => (
          <path
            key={i}
            d={ridgePath(r.pts, r.teeth)}
            fill="none"
            stroke="rgba(255,255,255,0.34)"
            strokeWidth={1.4 * k}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Turgen gorge */}
        <path
          d={line(TURGEN_GORGE)}
          fill="none"
          stroke="#1d2416"
          strokeWidth={16 * Math.max(0.5, k)}
          strokeOpacity={0.85}
          strokeLinecap="round"
        />
        <path
          d={line(TURGEN_GORGE)}
          fill="none"
          stroke="#7fa3c9"
          strokeWidth={2 * k}
          strokeOpacity={0.6}
          strokeLinecap="round"
        />

        {/* Bartogai reservoir */}
        <path d={polygonPath(RESERVOIR, px)} fill="#1b4a72" />
        <path d={polygonPath(RESERVOIR, px)} filter="url(#water)" />

        {/* Assy river */}
        <path
          d={line(ASSY_RIVER)}
          fill="none"
          stroke="#5f93c4"
          strokeWidth={3.4 * k}
          strokeOpacity={0.9}
          strokeLinecap="round"
        />

        {/* track up from Turgen */}
        <path
          d={line(TRACK)}
          fill="none"
          stroke="#d9cfae"
          strokeWidth={1.6 * k}
          strokeOpacity={0.5}
          strokeDasharray={`${6 * k} ${5 * k}`}
        />

        {/* springs and river fords */}
        {water.map((w) => {
          const q = px(w.at);
          return (
            <circle
              key={w.id}
              cx={q.x}
              cy={q.y}
              r={3.4 * k}
              fill="#7fb2e0"
              stroke="rgba(0,0,0,0.45)"
              strokeWidth={0.8 * k}
            />
          );
        })}

        {/* named places */}
        {landmarks.map((l) => {
          const q = px(l.at);
          return (
            <g key={l.id}>
              <rect
                x={q.x - 3.5 * k}
                y={q.y - 3.5 * k}
                width={7 * k}
                height={7 * k}
                fill="#f2ead2"
                stroke="rgba(0,0,0,0.5)"
                strokeWidth={0.8 * k}
              />
              <text
                x={q.x}
                y={q.y + 14 * k}
                textAnchor="middle"
                className="terrain-label"
                style={{ fontSize: 9 * k, strokeWidth: 2.6 * k }}
              >
                {b(l.name)}
              </text>
            </g>
          );
        })}

        {/* area names */}
        {data.paddocks.map((p) => {
          const c = px(p.centroid);
          return (
            <text
              key={`n-${p.id}`}
              x={c.x}
              y={c.y}
              textAnchor="middle"
              className="terrain-label strong"
              style={{ fontSize: 11 * k, strokeWidth: 3 * k }}
            >
              {b(p.name)}
            </text>
          );
        })}

        {/* terrain names */}
        <text x={px({ x: 1500, y: 700 }).x} y={px({ x: 0, y: 700 }).y} className="terrain-label italic" style={{ fontSize: 10 * k, strokeWidth: 3 * k }}>
          {t('turgenGorge')}
        </text>
        <text
          x={px({ x: 10250, y: 0 }).x}
          y={px({ x: 0, y: 5900 }).y}
          textAnchor="middle"
          className="terrain-label italic"
          style={{ fontSize: 10 * k, strokeWidth: 3 * k }}
        >
          {t('bartogai')}
        </text>
        <text
          x={px({ x: 6600, y: 0 }).x}
          y={px({ x: 0, y: 5060 }).y}
          className="terrain-label italic"
          style={{ fontSize: 9.5 * k, strokeWidth: 3 * k }}
        >
          {t('assyRiver')}
        </text>

        {/* every animal, always — this is what makes the map read as live */}
        {cowStates.map((c) => {
          const sel = selectedCow === c.cow.id;
          const q = px(c.at);
          // zoomed into one herd the useful colour is detection confidence; across the
          // whole plateau it is which herd the animal belongs to
          const colour = !herdFilter
            ? SERIES_VAR(Number(c.cow.herdId.slice(1)))
            : !c.detected
              ? STATUS_VAR.critical
              : c.confidencePct >= 95
                ? STATUS_VAR.good
                : c.confidencePct >= 85
                  ? STATUS_VAR.warning
                  : STATUS_VAR.serious;
          return (
            <circle
              key={c.cow.id}
              cx={q.x}
              cy={q.y}
              r={(sel ? 5 : herdFilter ? 2.4 : 1.7) * k}
              fill={c.detected ? colour : 'none'}
              stroke={c.detected ? (sel ? '#fff' : 'rgba(0,0,0,0.5)') : STATUS_VAR.critical}
              strokeWidth={(sel ? 2 : c.detected ? 0.4 : 1.2) * k}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectCow?.(sel ? null : c.cow.id)}
            />
          );
        })}

        {/* herd markers */}
        {!herdFilter &&
          steps.map((s) => {
            const herd = data.herds.find((h) => h.id === s.herdId)!;
            const q = px(s.at);
            return (
              <g key={s.herdId}>
                <circle
                  cx={q.x}
                  cy={q.y}
                  r={(s.spreadM * SCALE) / 2 + 4}
                  fill={SERIES_VAR(Number(herd.color.slice(1)))}
                  fillOpacity={0.14}
                  stroke={SERIES_VAR(Number(herd.color.slice(1)))}
                  strokeOpacity={0.5}
                  strokeWidth={1}
                />
                <circle
                  cx={q.x}
                  cy={q.y - 26}
                  r={11}
                  fill={SERIES_VAR(Number(herd.color.slice(1)))}
                  stroke="#fff"
                  strokeWidth={2}
                />
                <text
                  x={q.x}
                  y={q.y - 22}
                  textAnchor="middle"
                  style={{ fill: '#fff', fontSize: 12, fontWeight: 700 }}
                >
                  {herd.id.slice(1)}
                </text>
              </g>
            );
          })}

        {/* animals that need a person, always called out */}
        {highlight.map((c) => {
          const q = px(c.at);
          return (
            <g key={`hl-${c.cow.id}`} style={{ cursor: 'pointer' }} onClick={() => onSelectCow?.(c.cow.id)}>
              <circle
                cx={q.x}
                cy={q.y}
                r={9 * k}
                fill="none"
                stroke={STATUS_VAR[cowSeverity(c)]}
                strokeWidth={2.2 * k}
              />
              <circle cx={q.x} cy={q.y} r={3.4 * k} fill={STATUS_VAR[cowSeverity(c)]} />
              <text
                x={q.x}
                y={q.y - 13 * k}
                textAnchor="middle"
                className="terrain-label strong"
                style={{ fontSize: 10 * k, strokeWidth: 3 * k }}
              >
                {c.cow.id}
              </text>
            </g>
          );
        })}

        {/* scale bar */}
        <g transform={`translate(${vb.x + vb.w - 100 - 30 * k} ${vb.y + vb.h - 24 * k})`}>
          <line x1={0} x2={100} y1={0} y2={0} stroke="#fff" strokeWidth={2 * k} strokeOpacity={0.85} />
          <line x1={0} x2={0} y1={-4 * k} y2={4 * k} stroke="#fff" strokeWidth={2 * k} strokeOpacity={0.85} />
          <line x1={100} x2={100} y1={-4 * k} y2={4 * k} stroke="#fff" strokeWidth={2 * k} strokeOpacity={0.85} />
          <text
            x={50}
            y={-6 * k}
            textAnchor="middle"
            className="terrain-label"
            style={{ fontSize: 9 * k, strokeWidth: 2.5 * k }}
          >
            1 km
          </text>
        </g>
        <g transform={`translate(${vb.x + 26 * k} ${vb.y + 34 * k}) scale(${k})`}>
          <path d="M0 -13 L5 6 L0 1 L-5 6 Z" fill="#fff" fillOpacity={0.85} />
          <text y={19} textAnchor="middle" className="terrain-label" style={{ fontSize: 9 }}>
            N
          </text>
        </g>
      </svg>

      <div className="map-overlay tr">
        {cursor && <div className="map-chip mono">{cursor}</div>}
        {hoverArea && (
          <div className="map-chip">
            <strong>{b(paddockById.get(hoverArea)!.name)}</strong> ·{' '}
            {t(`state_${areaState.get(hoverArea)!}` as 'state_ok')}
          </div>
        )}
      </div>

      <div className="map-overlay bl">
        <div className="map-chip">
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {(['ok', 'watch', 'outOfGrass'] as const).map((st) => (
              <span key={st} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span
                  className="legend-swatch"
                  style={{ background: STATUS_VAR[STATE_SEVERITY[st]] }}
                  aria-hidden="true"
                />
                {t(`state_${st}` as 'state_ok')}
              </span>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
