import { paddockById, SHEEP_UNITS_PER_AU, TOTAL_AU } from '../data/ranch';
import type { Dataset } from '../data/types';

/**
 * Rotational grazing loads a paddock hard for a few days and then rests it, so the
 * instantaneous stocking rate is not comparable to carrying capacity. The season-to-date
 * mean (animal-unit days spread over the whole period) is what the balance rules use.
 */
export function meanStockingByPaddock(data: Dataset, throughDay: number) {
  const acc = new Map<string, number>();
  for (const pd of data.paddockDays) {
    if (pd.day > throughDay) continue;
    acc.set(pd.paddockId, (acc.get(pd.paddockId) ?? 0) + pd.stockingAuHa);
  }
  const out = new Map<string, number>();
  for (const [id, total] of acc) out.set(id, total / (throughDay + 1));
  return out;
}

export function pressuredAreaByDay(data: Dataset) {
  return Array.from({ length: data.meta.days }, (_, d) =>
    data.paddockDays
      .filter((pd) => pd.day === d && pd.utilization > 0.85)
      .reduce((a, pd) => a + paddockById.get(pd.paddockId)!.areaHa, 0),
  );
}

/** Share of grazing cycles that got at least 25 rest days before being re-grazed. */
export function restCompliance(data: Dataset) {
  let cycles = 0;
  let compliant = 0;
  for (const p of data.paddocks) {
    const rows = data.paddockDays.filter((pd) => pd.paddockId === p.id).sort((a, b) => a.day - b.day);
    let restRun = 0;
    let sawGrazing = false;
    for (const pd of rows) {
      if (pd.stockingAuHa > 0) {
        if (restRun > 0 && sawGrazing) {
          cycles++;
          if (restRun >= 25) compliant++;
        }
        restRun = 0;
        sawGrazing = true;
      } else if (sawGrazing) {
        restRun++;
      }
    }
  }
  return { cycles, compliant, rate: cycles ? compliant / cycles : 1 };
}

/** Share of paddock-days that at least one mission actually imaged. */
export function monitoringCoverage(data: Dataset, throughDay: number) {
  let covered = 0;
  const total = data.paddocks.length * (throughDay + 1);
  for (let d = 0; d <= throughDay; d++) {
    const ids = new Set(data.flights.filter((f) => f.day === d).flatMap((f) => f.paddockIds));
    covered += ids.size;
  }
  return total ? covered / total : 0;
}

export const ranchSheepUnits = () => Math.round(TOTAL_AU * SHEEP_UNITS_PER_AU);

/** How often each paddock actually got imaged, and how stale the last look is. */
export function surveyCoverageByPaddock(data: Dataset, throughDay: number) {
  const out = new Map<string, { days: number; lastSeen: number | null }>();
  for (const p of data.paddocks) {
    let days = 0;
    let last: number | null = null;
    for (let d = 0; d <= throughDay; d++) {
      const imaged = data.flights.some((f) => f.day === d && f.paddockIds.includes(p.id));
      if (imaged) {
        days++;
        last = d;
      }
    }
    out.set(p.id, { days, lastSeen: last == null ? null : throughDay - last });
  }
  return out;
}

export function detectionRateByDay(data: Dataset) {
  return Array.from({ length: data.meta.days }, (_, d) => {
    const dets = data.flights.filter((f) => f.day === d).flatMap((f) => f.detections);
    if (!dets.length) return { day: d, rate: null as number | null, confidence: null as number | null };
    const expected = dets.reduce((a, x) => a + x.expected, 0);
    const detected = dets.reduce((a, x) => a + x.detected, 0);
    return {
      day: d,
      rate: (detected / expected) * 100,
      confidence: dets.reduce((a, x) => a + x.confidencePct, 0) / dets.length,
    };
  });
}
