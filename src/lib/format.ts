import type { Severity } from '../data/types';

export const fmt = (v: number, digits = 0) =>
  v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;

export const SERIES_VAR = (n: number) => `var(--series-${n})`;

export const STATUS_VAR: Record<Severity, string> = {
  good: 'var(--good)',
  warning: 'var(--warning)',
  serious: 'var(--serious)',
  critical: 'var(--critical)',
};

export const severityRank: Record<Severity, number> = {
  critical: 0,
  serious: 1,
  warning: 2,
  good: 3,
};

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const body = rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\n');
  const blob = new Blob([`﻿${body}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const healthSeverity = (index: number): Severity =>
  index >= 70 ? 'good' : index >= 55 ? 'warning' : index >= 40 ? 'serious' : 'critical';

/** Utilisation is season offtake / allowable offtake, so 1.0 is the full safe allowance. */
export const utilisationSeverity = (u: number): Severity =>
  u <= 0.7 ? 'good' : u <= 0.85 ? 'warning' : u <= 1 ? 'serious' : 'critical';
