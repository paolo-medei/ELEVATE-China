import defaultFarm from './farm.json';
import { writeRecordStore } from './store';

/**
 * The input database. `farm.json` ships with the app; a copy edited by hand can be loaded
 * from the Data menu and is kept in this browser, so the whole interface — counts, map,
 * grass, alerts, history — is recomputed from whatever file is in force.
 */
export type Farm = typeof defaultFarm & {
  /**
   * What the drone measured, when a workbook supplies it. These are observations, not
   * settings: where each animal was on each flight, what each herd counted, how green each
   * area was. Absent by default — the app simulates them — and any subset may be given.
   */
  records?: {
    counts?: {
      day: number;
      hour: number;
      herdId: string;
      detected: number;
      confidencePct: number;
      flagged: number;
    }[];
    grassland?: { day: number; areaId: string; ndvi: number; biomass: number }[];
    cows?: {
      day: number;
      hour: number;
      cowId: string;
      herdId: string;
      lat: number;
      lon: number;
      detected: boolean;
      confidencePct: number;
    }[];
  };
};

const KEY = 'farmerswingman.farm';

/**
 * The settings are small enough to read synchronously, before anything derives from them.
 *
 * Every touch of localStorage sits inside the try, including the test for whether it is
 * there: a browser set to block site data throws on the property itself, and this runs
 * while the app is still being imported, so an escaping error means a blank page.
 */
function readOverride(): Farm | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as Farm) : null;
  } catch {
    return null;
  }
}

const override = readOverride();

/** Read at module load, before anything derives from it — one config for one page load. */
export const FARM: Farm = override ?? defaultFarm;
export const usingCustomFarm = override !== null;

/** Minimal sanity check: enough to catch a truncated or unrelated file. */
export function validateFarm(candidate: unknown): string | null {
  const f = candidate as Partial<Farm>;
  if (!f || typeof f !== 'object') return 'Not a JSON object';
  if (!f.meta || !f.season || !f.areas || !f.herds || !f.weather) {
    return 'Missing one of: meta, season, areas, herds, weather';
  }
  if (!Array.isArray(f.areas) || f.areas.length === 0) return 'areas must be a non-empty list';
  if (!Array.isArray(f.herds) || f.herds.length === 0) return 'herds must be a non-empty list';
  if (!Array.isArray(f.weather) || f.weather.length < f.season.days) {
    return `weather needs one entry per day (${f.season.days})`;
  }
  const cells = f.meta.gridCols * f.meta.gridRows;
  if (f.areas.length !== cells) {
    return `${f.areas.length} areas but the grid is ${f.meta.gridCols}×${f.meta.gridRows} = ${cells}`;
  }
  const ids = new Set(f.areas.map((a) => a.id));
  for (const h of f.herds) {
    for (const areaId of h.rotation) {
      if (!ids.has(areaId)) return `${h.id} rotates through ${areaId}, which is not in areas`;
    }
  }
  return null;
}

/**
 * Store the loaded database and reload, so every derived figure is rebuilt from it. The
 * settings and the records part ways here: settings to localStorage, records to IndexedDB,
 * because only one of the two is small.
 */
export async function applyFarm(candidate: unknown): Promise<string | null> {
  const problem = validateFarm(candidate);
  if (problem) return problem;
  const { records, ...settings } = candidate as Farm;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    return 'this browser will not keep the settings';
  }
  const kept = await writeRecordStore(records ?? null);
  if (kept) return kept;
  location.reload();
  return null;
}

export async function resetFarm() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
  await writeRecordStore(null);
  location.reload();
}

export function downloadFarm() {
  const blob = new Blob([JSON.stringify(FARM, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'farm.json';
  a.click();
  URL.revokeObjectURL(url);
}
