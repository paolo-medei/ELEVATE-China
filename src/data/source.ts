import defaultFarm from './farm.json';

/**
 * The input database. `farm.json` ships with the app; a copy edited by hand can be loaded
 * from the Data menu and is kept in this browser, so the whole interface — counts, map,
 * grass, alerts, history — is recomputed from whatever file is in force.
 */
export type Farm = typeof defaultFarm;

const KEY = 'farmerswingman.farm';

function readOverride(): Farm | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
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

/** Store the edited database and reload, so every derived figure is rebuilt from it. */
export function applyFarm(candidate: unknown) {
  const problem = validateFarm(candidate);
  if (problem) return problem;
  localStorage.setItem(KEY, JSON.stringify(candidate));
  location.reload();
  return null;
}

export function resetFarm() {
  localStorage.removeItem(KEY);
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
