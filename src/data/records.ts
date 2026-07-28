import { readRecordStore } from './store';

/**
 * Recorded observations, as opposed to the settings that generate a season.
 *
 * The spreadsheet carries what the drone measured — a count per herd per flight, a green
 * index per area per day, a position per animal per flight. When a workbook comes back
 * with those sheets, the numbers in them win over the simulated ones: the app is then
 * showing the record, not a model of it. Anything the sheet does not mention stays
 * simulated, so a farmer can correct one flight without supplying a whole season.
 */

export type CountRecord = {
  day: number;
  hour: number;
  herdId: string;
  detected: number;
  confidencePct: number;
  flagged: number;
};

export type GrasslandRecord = {
  day: number;
  areaId: string;
  ndvi: number;
  biomass: number;
};

export type CowRecord = {
  day: number;
  hour: number;
  cowId: string;
  herdId: string;
  lat: number;
  lon: number;
  detected: boolean;
  confidencePct: number;
};

/**
 * What the per-animal rows add up to for one herd on one flight. The individual record is
 * the finer measurement, so where it exists it settles the herd count too — otherwise the
 * dashboard could say every animal is present while the map showed forty that were not.
 */
export type Tally = { seen: number; total: number; missing: Set<string>; confidencePct: number };

export type Records = {
  counts?: CountRecord[];
  grassland?: GrasslandRecord[];
  cows?: CowRecord[];
};

let countIndex: Map<string, CountRecord> | null = null;
let grassIndex: Map<string, GrasslandRecord> | null = null;
let cowIndex: Map<string, CowRecord> | null = null;
let tallyIndex: Map<string, Tally> | null = null;

export const recordCounts = { counts: 0, grassland: 0, cows: 0 };

const index = <T>(rows: T[] | undefined, key: (r: T) => string) => {
  if (!rows?.length) return null;
  const m = new Map<string, T>();
  for (const r of rows) m.set(key(r), r);
  return m;
};

/**
 * Fetch the stored records and build the lookups. Called once from the entry point before
 * the first render — everything that consults them runs during render, never at import.
 */
export async function preloadRecords() {
  const records = (await readRecordStore<Records>()) ?? {};
  countIndex = index(records.counts, (r) => `${r.day}:${r.hour}:${r.herdId}`);
  grassIndex = index(records.grassland, (r) => `${r.day}:${r.areaId}`);
  cowIndex = index(records.cows, (r) => `${r.day}:${r.hour}:${r.cowId}`);
  tallyIndex = tally(records.cows);
  recordCounts.counts = records.counts?.length ?? 0;
  recordCounts.grassland = records.grassland?.length ?? 0;
  recordCounts.cows = records.cows?.length ?? 0;
}

function tally(rows: CowRecord[] | undefined) {
  if (!rows?.length) return null;
  const m = new Map<string, Tally & { confSum: number }>();
  for (const r of rows) {
    const key = `${r.day}:${r.hour}:${r.herdId}`;
    let t = m.get(key);
    if (!t) {
      t = { seen: 0, total: 0, missing: new Set(), confidencePct: 0, confSum: 0 };
      m.set(key, t);
    }
    t.total++;
    if (r.detected) {
      t.seen++;
      t.confSum += r.confidencePct;
    } else {
      t.missing.add(r.cowId);
    }
  }
  for (const t of m.values()) t.confidencePct = +(t.confSum / Math.max(1, t.seen)).toFixed(1);
  return m as Map<string, Tally>;
}

export const cowTally = (day: number, hour: number, herdId: string) =>
  tallyIndex?.get(`${day}:${hour}:${herdId}`) ?? null;

/** The first flight on a day for which per-animal rows exist — the count that day rests on. */
export const cowTallyForDay = (day: number, herdId: string) => {
  if (!tallyIndex) return null;
  for (const [key, t] of tallyIndex) {
    const [d, , h] = key.split(':');
    if (Number(d) === day && h === herdId) return t;
  }
  return null;
};

export const countRecord = (day: number, hour: number, herdId: string) =>
  countIndex?.get(`${day}:${hour}:${herdId}`) ?? null;

export const grasslandRecord = (day: number, areaId: string) =>
  grassIndex?.get(`${day}:${areaId}`) ?? null;

export const cowRecord = (day: number, hour: number, cowId: string) =>
  cowIndex?.get(`${day}:${hour}:${cowId}`) ?? null;
