import { useMemo, useState, type ReactNode } from 'react';
import { useUi } from '../i18n';

/* ------------------------------------------------------------------ *
 * scales, ticks, colour ramps
 * ------------------------------------------------------------------ */

const SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

export function useRamp() {
  const { theme } = useUi();
  // sequential = one hue, light→dark. On a dark surface the near-zero end is the
  // one that recedes toward the surface, so the ramp runs dark→light instead.
  return theme === 'light' ? SEQ : [...SEQ].reverse();
}

const hexToRgb = (hex: string) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const mix = (a: string, b: string, t: number) => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r} ${g} ${bl})`;
};

export const rampColor = (stops: string[], t: number) => {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
};

export function useDiverging() {
  const { theme } = useUi();
  const mid = theme === 'light' ? '#e1e0d9' : '#383835';
  // negative arm = over pressure (warm), positive arm = slack (cool)
  const neg = ['#d03b3b', '#ec835a'];
  const pos = theme === 'light' ? ['#3987e5', '#184f95'] : ['#6da7ec', '#256abf'];
  return (t: number) => {
    const v = Math.max(-1, Math.min(1, t));
    if (v < 0) return rampColor([neg[0], neg[1], mid], 1 + v);
    return rampColor([mid, pos[0], pos[1]], v);
  };
}

export const readableInk = (rgb: string) => {
  const m = rgb.match(/\d+/g);
  if (!m) return '#fff';
  const [r, g, b] = m.map(Number);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0b0b0b' : '#ffffff';
};

export function niceTicks(min: number, max: number, count = 4) {
  if (min === max) return [min];
  const span = max - min;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) out.push(+v.toFixed(10));
  return out;
}

/* ------------------------------------------------------------------ *
 * shared chart chrome
 * ------------------------------------------------------------------ */

const W = 720;
const M = { l: 46, r: 16, t: 12, b: 26 };

type TipRow = { label: ReactNode; value: ReactNode; color?: string };

function Tooltip({
  x,
  y,
  title,
  rows,
}: {
  x: number;
  y: number;
  title: ReactNode;
  rows: TipRow[];
}) {
  return (
    <div
      className="tooltip"
      style={{ left: `${Math.max(6, Math.min(94, x))}%`, top: `${Math.max(0, y)}%` }}
      role="status"
    >
      <div className="tooltip-title">{title}</div>
      {rows.map((r, i) => (
        <div className="tooltip-row" key={i}>
          <span className="k">
            {r.color && (
              <span className="legend-swatch" style={{ background: r.color }} aria-hidden="true" />
            )}
            {r.label}
          </span>
          <span className="v">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export type Series = {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  area?: boolean;
};

export type Point = { label: string; values: Record<string, number | null> };

/* ------------------------------------------------------------------ *
 * line / stacked-area chart
 * ------------------------------------------------------------------ */

export function LineChart({
  points,
  series,
  height = 210,
  yFormat = (v: number) => String(Math.round(v)),
  valueFormat,
  yMin,
  yMax,
  stacked = false,
  refLine,
  xTickEvery = 5,
  tipTitle,
}: {
  points: Point[];
  series: Series[];
  height?: number;
  yFormat?: (v: number) => string;
  valueFormat?: (v: number, key: string) => string;
  yMin?: number;
  yMax?: number;
  stacked?: boolean;
  refLine?: { value: number; label: string; color?: string };
  xTickEvery?: number;
  tipTitle?: (p: Point, i: number) => ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const H = height;
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;

  const stackedVals = useMemo(() => {
    if (!stacked) return null;
    return points.map((p) => {
      let acc = 0;
      const out: Record<string, [number, number]> = {};
      for (const s of series) {
        const v = p.values[s.key] ?? 0;
        out[s.key] = [acc, acc + v];
        acc += v;
      }
      return out;
    });
  }, [points, series, stacked]);

  const { lo, hi } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    points.forEach((p, i) => {
      if (stacked && stackedVals) {
        const last = stackedVals[i][series[series.length - 1].key];
        min = Math.min(min, 0);
        max = Math.max(max, last ? last[1] : 0);
      } else {
        for (const s of series) {
          const v = p.values[s.key];
          if (v == null) continue;
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
    });
    if (refLine) {
      min = Math.min(min, refLine.value);
      max = Math.max(max, refLine.value);
    }
    if (!Number.isFinite(min)) {
      min = 0;
      max = 1;
    }
    const pad = (max - min) * 0.12 || 1;
    return {
      lo: yMin ?? (stacked ? 0 : min - pad),
      hi: yMax ?? max + pad,
    };
  }, [points, series, stacked, stackedVals, yMin, yMax, refLine]);

  const x = (i: number) => M.l + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => M.t + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const ticks = niceTicks(lo, hi, 4);

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - r.left) / r.width;
    const i = Math.round(rel * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  const hoverPoint = hover != null ? points[hover] : null;
  const tipY =
    hover != null
      ? (Math.min(
          ...series.map((s) => {
            const v = stacked && stackedVals ? stackedVals[hover][s.key][1] : hoverPoint!.values[s.key];
            return v == null ? H : y(v);
          }),
        ) /
          H) *
        100
      : 0;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line className="gridline" x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} />
            <text className="tick y" x={M.l - 8} y={y(t) + 3.5}>
              {yFormat(t)}
            </text>
          </g>
        ))}
        <line className="axisline" x1={M.l} x2={W - M.r} y1={M.t + plotH} y2={M.t + plotH} />

        {points.map((p, i) =>
          i % xTickEvery === 0 || i === points.length - 1 ? (
            <text className="tick" key={i} x={x(i)} y={H - 8} textAnchor="middle">
              {p.label}
            </text>
          ) : null,
        )}

        {refLine && (
          <g>
            <line
              x1={M.l}
              x2={W - M.r}
              y1={y(refLine.value)}
              y2={y(refLine.value)}
              stroke={refLine.color ?? 'var(--text-muted)'}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            <text
              className="tick"
              x={W - M.r}
              y={y(refLine.value) - 5}
              textAnchor="end"
              style={{ fill: refLine.color ?? 'var(--text-muted)' }}
            >
              {refLine.label}
            </text>
          </g>
        )}

        {stacked && stackedVals
          ? [...series].reverse().map((s) => {
              const top = points.map((_, i) => `${x(i)},${y(stackedVals[i][s.key][1])}`);
              const bottom = points
                .map((_, i) => `${x(points.length - 1 - i)},${y(stackedVals[points.length - 1 - i][s.key][0])}`)
                .join(' ');
              return (
                <polygon
                  key={s.key}
                  points={`${top.join(' ')} ${bottom}`}
                  fill={s.color}
                  fillOpacity={0.9}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
              );
            })
          : series.map((s) => {
              const d = points
                .map((p, i) => {
                  const v = p.values[s.key];
                  return v == null ? null : `${i === 0 ? 'M' : 'L'}${x(i)} ${y(v)}`;
                })
                .filter(Boolean)
                .join(' ');
              const areaD =
                s.area && points.length
                  ? `${d} L${x(points.length - 1)} ${M.t + plotH} L${x(0)} ${M.t + plotH} Z`
                  : null;
              return (
                <g key={s.key}>
                  {areaD && <path d={areaD} fill={s.color} fillOpacity={0.13} />}
                  <path
                    d={d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeDasharray={s.dashed ? '6 4' : undefined}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}

        {hover != null && (
          <g pointerEvents="none">
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={M.t}
              y2={M.t + plotH}
              stroke="var(--text-muted)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {series.map((s) => {
              const v = stacked && stackedVals ? stackedVals[hover][s.key][1] : points[hover].values[s.key];
              if (v == null) return null;
              return (
                <circle
                  key={s.key}
                  cx={x(hover)}
                  cy={y(v)}
                  r={4.5}
                  fill={s.color}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                />
              );
            })}
          </g>
        )}

        <rect
          x={M.l}
          y={M.t}
          width={plotW}
          height={plotH}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>

      {hover != null && hoverPoint && (
        <Tooltip
          x={(x(hover) / W) * 100}
          y={tipY}
          title={tipTitle ? tipTitle(hoverPoint, hover) : hoverPoint.label}
          rows={series
            .filter((s) => hoverPoint.values[s.key] != null)
            .map((s) => ({
              label: s.label,
              color: s.color,
              value: valueFormat
                ? valueFormat(hoverPoint.values[s.key] as number, s.key)
                : yFormat(hoverPoint.values[s.key] as number),
            }))}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * vertical bar chart (grouped or stacked)
 * ------------------------------------------------------------------ */

const roundedTop = (x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.max(0, Math.min(r, h, w / 2));
  return `M${x} ${y + h} L${x} ${y + rr} Q${x} ${y} ${x + rr} ${y} L${x + w - rr} ${y} Q${x + w} ${y} ${x + w} ${y + rr} L${x + w} ${y + h} Z`;
};

export function BarChart({
  points,
  series,
  stacked = true,
  height = 210,
  yFormat = (v: number) => String(Math.round(v)),
  valueFormat,
  xTickEvery = 5,
  refLine,
  tipTitle,
}: {
  points: Point[];
  series: Series[];
  stacked?: boolean;
  height?: number;
  yFormat?: (v: number) => string;
  valueFormat?: (v: number, key: string) => string;
  xTickEvery?: number;
  refLine?: { value: number; label: string; color?: string };
  tipTitle?: (p: Point, i: number) => ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const H = height;
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;
  const band = plotW / points.length;
  const barW = Math.max(2, band * (stacked ? 0.68 : 0.8));

  const max = useMemo(() => {
    let m = refLine?.value ?? 0;
    for (const p of points) {
      if (stacked) {
        m = Math.max(m, series.reduce((a, s) => a + (p.values[s.key] ?? 0), 0));
      } else {
        for (const s of series) m = Math.max(m, p.values[s.key] ?? 0);
      }
    }
    return m * 1.1 || 1;
  }, [points, series, stacked, refLine]);

  const y = (v: number) => M.t + plotH - (v / max) * plotH;
  const ticks = niceTicks(0, max, 4);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line className="gridline" x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} />
            <text className="tick y" x={M.l - 8} y={y(t) + 3.5}>
              {yFormat(t)}
            </text>
          </g>
        ))}
        <line className="axisline" x1={M.l} x2={W - M.r} y1={M.t + plotH} y2={M.t + plotH} />

        {points.map((p, i) => {
          const bx = M.l + band * i + (band - barW) / 2;
          let acc = 0;
          const dim = hover != null && hover !== i;
          return (
            <g key={i} opacity={dim ? 0.45 : 1}>
              {stacked
                ? series.map((s, si) => {
                    const v = p.values[s.key] ?? 0;
                    if (v <= 0) return null;
                    const y0 = y(acc);
                    acc += v;
                    const y1 = y(acc);
                    const isTop = si === series.length - 1 || acc >= series.reduce((a, ss) => a + (p.values[ss.key] ?? 0), 0) - 0.001;
                    // 2px surface gap between stacked segments
                    const h = Math.max(1, y0 - y1 - 2);
                    return (
                      <path
                        key={s.key}
                        d={isTop ? roundedTop(bx, y1, barW, h, 4) : `M${bx} ${y1} h${barW} v${h} h${-barW} Z`}
                        fill={s.color}
                      />
                    );
                  })
                : series.map((s, si) => {
                    const v = p.values[s.key] ?? 0;
                    const sw = (barW - 2 * (series.length - 1)) / series.length;
                    const sx = bx + si * (sw + 2);
                    const h = Math.max(1, M.t + plotH - y(v));
                    return <path key={s.key} d={roundedTop(sx, y(v), sw, h, 4)} fill={s.color} />;
                  })}
              {i % xTickEvery === 0 || i === points.length - 1 ? (
                <text className="tick" x={bx + barW / 2} y={H - 8} textAnchor="middle">
                  {p.label}
                </text>
              ) : null}
              <rect
                x={M.l + band * i}
                y={M.t}
                width={band}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}

        {refLine && (
          <g>
            <line
              x1={M.l}
              x2={W - M.r}
              y1={y(refLine.value)}
              y2={y(refLine.value)}
              stroke={refLine.color ?? 'var(--text-muted)'}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            <text
              className="tick"
              x={W - M.r}
              y={y(refLine.value) - 5}
              textAnchor="end"
              style={{ fill: refLine.color ?? 'var(--text-muted)' }}
            >
              {refLine.label}
            </text>
          </g>
        )}
      </svg>

      {hover != null && (
        <Tooltip
          x={((M.l + band * hover + band / 2) / W) * 100}
          y={(y(stacked ? series.reduce((a, s) => a + (points[hover].values[s.key] ?? 0), 0) : Math.max(...series.map((s) => points[hover].values[s.key] ?? 0))) / H) * 100}
          title={tipTitle ? tipTitle(points[hover], hover) : points[hover].label}
          rows={series
            .filter((s) => (points[hover].values[s.key] ?? 0) > 0)
            .map((s) => ({
              label: s.label,
              color: s.color,
              value: valueFormat
                ? valueFormat(points[hover].values[s.key] as number, s.key)
                : yFormat(points[hover].values[s.key] as number),
            }))}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * horizontal bars with a target marker
 * ------------------------------------------------------------------ */

export type HBarRow = {
  key: string;
  label: string;
  sublabel?: string;
  value: number;
  color: string;
  target?: number;
  valueLabel: string;
  targetLabel?: string;
};

export function HBarChart({
  rows,
  max,
  labelWidth = 128,
  rowHeight = 26,
  onSelect,
}: {
  rows: HBarRow[];
  max?: number;
  labelWidth?: number;
  rowHeight?: number;
  onSelect?: (key: string) => void;
}) {
  const H = rows.length * rowHeight + 22;
  const plotW = W - labelWidth - 74;
  const hi = max ?? (Math.max(...rows.map((r) => Math.max(r.value, r.target ?? 0))) * 1.12 || 1);
  const bw = (v: number) => Math.max(2, (v / hi) * plotW);
  const ticks = niceTicks(0, hi, 4);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line
              className="gridline"
              x1={labelWidth + (t / hi) * plotW}
              x2={labelWidth + (t / hi) * plotW}
              y1={4}
              y2={rows.length * rowHeight + 2}
            />
            <text
              className="tick"
              x={labelWidth + (t / hi) * plotW}
              y={H - 6}
              textAnchor="middle"
            >
              {t}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cy = i * rowHeight + rowHeight / 2 + 2;
          const h = Math.min(13, rowHeight - 10);
          return (
            <g
              key={r.key}
              onClick={onSelect ? () => onSelect(r.key) : undefined}
              style={onSelect ? { cursor: 'pointer' } : undefined}
            >
              <text
                x={labelWidth - 10}
                y={cy + 4}
                textAnchor="end"
                style={{ fill: 'var(--text-secondary)', fontSize: 11.5, fontWeight: 550 }}
              >
                {r.label}
              </text>
              <rect
                x={labelWidth}
                y={cy - h / 2}
                width={plotW}
                height={h}
                rx={4}
                fill="var(--surface-3)"
              />
              <rect
                x={labelWidth}
                y={cy - h / 2}
                width={bw(r.value)}
                height={h}
                rx={4}
                fill={r.color}
              />
              {r.target !== undefined && (
                <g>
                  <rect
                    x={labelWidth + (r.target / hi) * plotW - 1}
                    y={cy - h / 2 - 4}
                    width={2}
                    height={h + 8}
                    rx={1}
                    fill="var(--text-primary)"
                  />
                  <title>{r.targetLabel}</title>
                </g>
              )}
              <text
                x={W - 8}
                y={cy + 4}
                textAnchor="end"
                style={{
                  fill: 'var(--text-primary)',
                  fontSize: 11.5,
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {r.valueLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * matrix heat grid
 * ------------------------------------------------------------------ */

export function HeatGrid({
  rows,
  cols,
  valueAt,
  colorAt,
  format,
  labelWidth = 92,
  cellH = 20,
  colTickEvery = 5,
  onCell,
}: {
  rows: { key: string; label: string }[];
  cols: { key: string; label: string }[];
  valueAt: (rowKey: string, colKey: string) => number | null;
  colorAt: (v: number) => string;
  format: (v: number) => string;
  labelWidth?: number;
  cellH?: number;
  colTickEvery?: number;
  onCell?: (rowKey: string, colKey: string) => void;
}) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const H = rows.length * cellH + 20;
  const cellW = (W - labelWidth - 8) / cols.length;
  const gap = Math.min(1.5, cellW * 0.16);
  const radius = Math.min(2.5, cellW * 0.34);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        {rows.map((r, ri) => (
          <text
            key={r.key}
            x={labelWidth - 8}
            y={ri * cellH + cellH / 2 + 4}
            textAnchor="end"
            style={{ fill: 'var(--text-secondary)', fontSize: 11 }}
          >
            {r.label}
          </text>
        ))}
        {cols.map((c, ci) =>
          ci % colTickEvery === 0 ? (
            <text
              key={c.key}
              className="tick"
              x={labelWidth + ci * cellW + cellW / 2}
              y={H - 5}
              textAnchor="middle"
            >
              {c.label}
            </text>
          ) : null,
        )}
        {rows.map((r, ri) =>
          cols.map((c, ci) => {
            const v = valueAt(r.key, c.key);
            const isHover = hover?.r === ri && hover?.c === ci;
            return (
              <rect
                key={`${r.key}-${c.key}`}
                x={labelWidth + ci * cellW}
                y={ri * cellH}
                width={Math.max(1, cellW - gap)}
                height={cellH - 1.5}
                rx={radius}
                fill={v == null ? 'var(--surface-3)' : colorAt(v)}
                stroke={isHover ? 'var(--text-primary)' : 'transparent'}
                strokeWidth={1.5}
                onMouseEnter={() => setHover({ r: ri, c: ci })}
                onMouseLeave={() => setHover(null)}
                onClick={onCell ? () => onCell(r.key, c.key) : undefined}
                style={onCell ? { cursor: 'pointer' } : undefined}
              />
            );
          }),
        )}
      </svg>
      {hover && (
        <Tooltip
          x={((labelWidth + hover.c * cellW + cellW / 2) / W) * 100}
          y={(hover.r * cellH) / H * 100}
          title={`${rows[hover.r].label} · ${cols[hover.c].label}`}
          rows={[
            {
              label: '',
              value: (() => {
                const v = valueAt(rows[hover.r].key, cols[hover.c].key);
                return v == null ? '—' : format(v);
              })(),
            },
          ]}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * sparkline
 * ------------------------------------------------------------------ */

export function Sparkline({
  values,
  color,
  height = 26,
  width = 120,
}: {
  values: number[];
  color: string;
  height?: number;
  width?: number;
}) {
  if (!values.length) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * (width - 2) + 1;
  const y = (v: number) => height - 2 - ((v - lo) / (hi - lo || 1)) * (height - 4);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <path d={`${d} L${x(values.length - 1)} ${height} L${x(0)} ${height} Z`} fill={color} fillOpacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.6} fill={color} />
    </svg>
  );
}
