import { paddockById } from '../data/ranch';
import type { PaddockDay, Severity } from '../data/types';

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
