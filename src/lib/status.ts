import { paddockById } from '../data/ranch';
import type { Alert, Dataset, PaddockDay, Severity } from '../data/types';

/**
 * The plain-language layer. The detailed views expose the underlying numbers;
 * everything here answers "so what do I do about it?" in three states.
 */
export type PaddockState = 'outOfGrass' | 'watch' | 'ok' | 'resting';

export function paddockState(pd: PaddockDay): PaddockState {
  const p = paddockById.get(pd.paddockId)!;
  const grazed = pd.stockingAuHa > 0;
  if (pd.utilization > 1 || pd.biomass < p.biomassCeiling * 0.32) return 'outOfGrass';
  if (pd.utilization > 0.85 || (grazed && pd.utilization > 0.7)) return 'watch';
  return grazed ? 'ok' : 'resting';
}

export const STATE_SEVERITY: Record<PaddockState, Severity> = {
  outOfGrass: 'critical',
  watch: 'warning',
  ok: 'good',
  resting: 'good',
};

export const isGrazed = (pd: PaddockDay) => pd.stockingAuHa > 0;

/** Grass left in the paddock, as a share of what the site grows at its best. */
export const grassLeft = (pd: PaddockDay) =>
  pd.biomass / paddockById.get(pd.paddockId)!.biomassCeiling;

export type Action = {
  id: string;
  severity: Severity;
  /** what to do, in one sentence */
  text: { en: string; zh: string };
  /** why the system is asking */
  why: { en: string; zh: string };
};

const KIND_RANK: Record<Alert['kind'], number> = {
  fenceBreach: 0,
  countMismatch: 1,
  animalWelfare: 2,
  waterGap: 3,
  overgrazing: 4,
  heatStress: 5,
  restViolation: 6,
};

/**
 * Turns the day's alerts into a short, ranked to-do list: one line per thing that
 * actually needs a person, with the reading that triggered it underneath.
 */
export function actionsForDay(data: Dataset, day: number): Action[] {
  const herdName = (id?: string) => data.herds.find((h) => h.id === id)?.name;
  const paddockName = (id?: string) => (id ? paddockById.get(id)?.name : undefined);

  const alerts = data.alerts
    .filter((a) => a.day === day)
    .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);

  const seen = new Set<string>();
  const out: Action[] = [];

  for (const a of alerts) {
    const key = `${a.kind}:${a.herdId ?? ''}:${a.paddockId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const herd = herdName(a.herdId);
    const paddock = paddockName(a.paddockId);

    let text: Action['text'];
    switch (a.kind) {
      case 'fenceBreach':
        text = {
          en: `Check the fence at ${paddock?.en ?? '—'} — ${herd?.en ?? 'the herd'} walked out`,
          zh: `检查${paddock?.zh ?? ''}围栏——${herd?.zh ?? '牛群'}已走出`,
        };
        break;
      case 'countMismatch':
        text = {
          en: `Go and find the missing cattle in ${herd?.en ?? 'the herd'}`,
          zh: `寻找${herd?.zh ?? '牛群'}中未清点的牛只`,
        };
        break;
      case 'animalWelfare':
        text = {
          en: `Look over the flagged animals in ${herd?.en ?? 'the herd'}`,
          zh: `复查${herd?.zh ?? '牛群'}中标记异常的牛只`,
        };
        break;
      case 'waterGap':
        text = {
          en: `Check the water point for ${herd?.en ?? 'the herd'}`,
          zh: `检查${herd?.zh ?? '牛群'}所在草场的水点`,
        };
        break;
      case 'overgrazing': {
        const grazedNow = data.paddockDays.some(
          (pd) => pd.day === day && pd.paddockId === a.paddockId && pd.stockingAuHa > 0,
        );
        text = grazedNow
          ? {
              en: `Move the herd out of ${paddock?.en ?? 'this area'} — the grass is used up`,
              zh: `将牛群转出${paddock?.zh ?? '该草场'}——牧草已用尽`,
            }
          : {
              en: `Leave ${paddock?.en ?? 'this area'} alone — its grass is used up for the season`,
              zh: `${paddock?.zh ?? '该草场'}本季牧草已用尽，暂勿放牧`,
            };
        break;
      }
      case 'heatStress':
        text = {
          en: `Hot day — check shade and water for ${herd?.en ?? 'the herd'}`,
          zh: `高温天气——为${herd?.zh ?? '牛群'}检查遮阴与饮水`,
        };
        break;
      default:
        text = {
          en: `Give ${paddock?.en ?? 'this area'} a longer rest before grazing it again`,
          zh: `${paddock?.zh ?? '该草场'}再次放牧前应延长休牧`,
        };
    }

    out.push({ id: a.id, severity: a.severity, text, why: a.detail });
  }

  return out.sort((a, b) => {
    const rank: Record<Severity, number> = { critical: 0, serious: 1, warning: 2, good: 3 };
    return rank[a.severity] - rank[b.severity];
  });
}
