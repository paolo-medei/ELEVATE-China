import type { ReactNode } from 'react';
import type { Severity } from '../data/types';

export function Card({
  title,
  sub,
  actions,
  children,
  flush,
  className,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={`card${className ? ` ${className}` : ''}`}>
      {(title || actions) && (
        <header className="card-head">
          <div style={{ minWidth: 0 }}>
            {title && <div className="card-title">{title}</div>}
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className={`card-body${flush ? ' flush' : ''}`}>{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  unit,
  foot,
  badge,
  accent,
  children,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  foot?: ReactNode;
  badge?: ReactNode;
  accent?: string;
  children?: ReactNode;
}) {
  return (
    <section className="card stat">
      <div className="stat-label">
        {accent && (
          <span className="legend-swatch" style={{ background: accent }} aria-hidden="true" />
        )}
        {label}
      </div>
      <div className="stat-value">
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      {(foot || badge) && (
        <div className="stat-foot">
          {badge}
          {foot}
        </div>
      )}
      {children}
    </section>
  );
}

const SEVERITY_ICON: Record<Severity, string> = {
  critical: '⨯',
  serious: '!',
  warning: '△',
  good: '✓',
};

export function StatusBadge({ severity, children }: { severity: Severity; children: ReactNode }) {
  return (
    <span className={`badge ${severity}`}>
      <span className="dot" aria-hidden="true" />
      <span aria-hidden="true">{SEVERITY_ICON[severity]}</span>
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Legend({
  items,
  onToggle,
  hidden,
  shape = 'swatch',
}: {
  items: { key: string; label: ReactNode; color: string }[];
  onToggle?: (key: string) => void;
  hidden?: Set<string>;
  shape?: 'swatch' | 'line';
}) {
  return (
    <div className="legend">
      {items.map((it) => {
        const off = hidden?.has(it.key) ?? false;
        const swatch = (
          <span
            className={`legend-swatch${shape === 'line' ? ' line' : ''}`}
            style={{ background: it.color }}
            aria-hidden="true"
          />
        );
        return onToggle ? (
          <button
            key={it.key}
            type="button"
            className="legend-item"
            aria-pressed={!off}
            onClick={() => onToggle(it.key)}
          >
            {swatch}
            {it.label}
          </button>
        ) : (
          <span key={it.key} className="legend-item">
            {swatch}
            {it.label}
          </span>
        );
      })}
    </div>
  );
}

export function Meter({
  value,
  target,
  color,
}: {
  value: number;
  target?: number;
  color: string;
}) {
  return (
    <div className="meter">
      <span style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: color }} />
      {target !== undefined && (
        <i className="meter-tick" style={{ left: `${Math.min(100, target * 100)}%` }} />
      )}
    </div>
  );
}
