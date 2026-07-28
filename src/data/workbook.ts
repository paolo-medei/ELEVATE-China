import readXlsxFile from 'read-excel-file/browser';
import writeXlsxFile from 'write-excel-file/browser';
import defaultFarm from './farm.json';
import { FARM, type Farm } from './source';
import { ANIMAL_KINDS, areaNumber, SHEET, workbookSheets } from './workbookLayout';

/**
 * The spreadsheet face of the database.
 *
 * `farm.json` is what the app reads, but almost nobody wants to edit JSON. This module
 * hands out the same information as an Excel workbook and reads an edited one back.
 * Anything a sheet does not mention keeps the value it had, so a farmer can change one
 * cell and leave the rest alone.
 */

/** Build and download the workbook for the database currently in force. */
export async function downloadWorkbook() {
  await writeXlsxFile(workbookSheets(FARM)).toFile('farm-data.xlsx');
}

/* ------------------------------------------------------------------ reading */

type Cell = string | number | boolean | Date | null;
type Rows = Cell[][];

const text = (c: Cell) => (c === null || c === undefined ? '' : String(c).trim());
const num = (c: Cell) => {
  if (c === null || c === undefined || c === '') return null;
  const n = typeof c === 'number' ? c : Number(String(c).replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Rows that carry data. The header goes, and so do the help lines at the foot of each
 * sheet: every real row fills its second column, a note only ever fills the first.
 */
const body = (rows: Rows | undefined) => (rows ?? []).slice(1).filter((r) => text(r[1]) !== '');

const dateText = (c: Cell) => {
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  const s = text(c);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
};

/** Cols × rows must cover every area; pick the split closest to the shape of the ground. */
function gridFor(n: number, aspect: number) {
  let best = { gridCols: n, gridRows: 1, err: Infinity };
  for (let rows = 1; rows <= n; rows++) {
    if (n % rows !== 0) continue;
    const cols = n / rows;
    const err = Math.abs(cols / rows - aspect);
    if (err < best.err) best = { gridCols: cols, gridRows: rows, err };
  }
  return { gridCols: best.gridCols, gridRows: best.gridRows };
}

const PASTURES: Record<string, 'meadow' | 'typical' | 'sandy'> = {
  meadow: 'meadow',
  best: 'meadow',
  good: 'meadow',
  typical: 'typical',
  average: 'typical',
  medium: 'typical',
  sandy: 'sandy',
  poor: 'sandy',
  worst: 'sandy',
};

export class WorkbookError extends Error {}

/**
 * Turn an edited workbook back into a database. The farm currently in force is the
 * starting point, so a sheet a farmer deleted or left alone simply keeps its old values.
 */
export async function farmFromWorkbook(file: File): Promise<Farm> {
  const sheets = await readXlsxFile(file);
  const bySheet = new Map<string, Rows>();
  for (const s of sheets) bySheet.set(norm(s.sheet), s.data as Rows);
  const get = (name: string) => bySheet.get(norm(name));

  if (bySheet.size === 0) throw new WorkbookError('the workbook has no sheets');
  const known = Object.values(SHEET).some((n) => get(n));
  if (!known) {
    throw new WorkbookError(
      `no sheet named ${Object.values(SHEET).join(', ')} — use the workbook the app gives you`,
    );
  }

  const farm: Farm = structuredClone(FARM);

  // ---- Farm settings ------------------------------------------------------
  const settings = new Map<string, Cell>();
  for (const r of get(SHEET.farm) ?? []) {
    const label = norm(text(r[0]));
    if (label) settings.set(label, r[1] ?? null);
  }
  const setNum = (label: string, apply: (n: number) => void) => {
    if (!settings.has(norm(label))) return;
    const n = num(settings.get(norm(label))!);
    if (n !== null) apply(n);
  };
  const setText = (label: string, apply: (s: string) => void) => {
    const v = settings.get(norm(label));
    if (v !== undefined && text(v)) apply(text(v));
  };

  setText('Farm name', (s) => (farm.meta.farm = { en: s, zh: s }));
  setText('Region', (s) => (farm.meta.region = { en: s, zh: s }));
  if (settings.has(norm('Season starts'))) {
    const d = dateText(settings.get(norm('Season starts'))!);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new WorkbookError(`"Season starts" is not a date: ${d}`);
    farm.season.startDate = d;
  }
  setNum('Season length (days)', (n) => (farm.season.days = Math.max(1, Math.round(n))));
  setNum('Grass on best pasture (kg/ha)', (n) => (farm.forage.peakGrassKgPerHa.meadow = n));
  setNum('Grass on typical pasture (kg/ha)', (n) => (farm.forage.peakGrassKgPerHa.typical = n));
  setNum('Grass on poor pasture (kg/ha)', (n) => (farm.forage.peakGrassKgPerHa.sandy = n));
  setNum('Grass one cow eats per day (kg)', (n) => (farm.forage.intakeKgPerAnimalPerDay = n));
  setNum('Share of the grass that may be eaten', (n) => (farm.forage.allowableUse = n));
  setNum('Wind that grounds the drone (m/s)', (n) => (farm.flights.groundedAboveWindMs = n));
  setNum('Wind that shortens the flight (m/s)', (n) => (farm.flights.shortenedAboveWindMs = n));
  setNum('Cattle the camera misses (share)', (n) => (farm.flights.baseMissRate = n));
  setNum('Map layout number', (n) => (farm.meta.layoutSeed = Math.round(n)));
  setText('Drone flight hours', (s) => {
    const hours = s
      .split(/[,;]/)
      .map((h) => Number(h.trim()))
      .filter((h) => Number.isFinite(h) && h >= 0 && h <= 23);
    if (hours.length) farm.flights.hours = hours;
  });

  // ---- Areas --------------------------------------------------------------
  const areaRows = body(get(SHEET.areas));
  if (areaRows.length) {
    farm.areas = areaRows.map((r, i) => {
      const word = norm(text(r[1]).split(/[\s(/]/)[0]);
      const pasture = PASTURES[word];
      if (!pasture) {
        throw new WorkbookError(
          `Areas row ${i + 2}: "${text(r[1])}" is not a grass type — use meadow, typical or sandy`,
        );
      }
      const name = text(r[0]) || `Area ${i + 1}`;
      return { id: `P${i + 1}`, name: { en: name, zh: name }, pasture };
    });
    Object.assign(farm.meta, gridFor(farm.areas.length, farm.meta.widthM / farm.meta.heightM));
  }
  const areaIds = new Set(farm.areas.map((a) => a.id));

  // ---- Herds --------------------------------------------------------------
  const herdRows = body(get(SHEET.herds));
  if (herdRows.length) {
    farm.herds = herdRows.map((r, i) => {
      const line = i + 2;
      const head = num(r[1]);
      if (head === null || head < 1) throw new WorkbookError(`Herds row ${line}: "Cattle" must be a number`);
      const rotation = text(r[2])
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => `P${Number(s.replace(/\D/g, ''))}`);
      if (!rotation.length) throw new WorkbookError(`Herds row ${line}: list the areas this herd grazes`);
      for (const id of rotation) {
        if (!areaIds.has(id)) {
          throw new WorkbookError(`Herds row ${line}: there is no Area ${areaNumber(id)}`);
        }
      }
      const name = text(r[0]) || `Herd ${i + 1}`;
      const previous = FARM.herds[i];
      return {
        id: `H${i + 1}`,
        name: { en: name, zh: name },
        head: Math.round(head),
        animalUnitsPerHead: previous?.animalUnitsPerHead ?? 1,
        rotation,
        daysPerArea: Math.max(1, Math.round(num(r[3]) ?? 12)),
        rotationOffset: Math.max(0, Math.round(num(r[4]) ?? 0)),
      };
    });
  }

  // ---- Animals to watch ---------------------------------------------------
  const animalSheet = get(SHEET.animals);
  if (animalSheet) {
    const events: Farm['animalEvents'] = { lost: [], needsAttention: [], separated: [], welfare: [] };
    const rows = body(animalSheet);
    for (const [i, r] of rows.entries()) {
      const line = i + 2;
      const kind = norm(text(r[0]));
      const cowId = text(r[1]);
      const fromDay = Math.max(0, Math.round(num(r[2]) ?? 0));
      const awayM = num(r[3]) ?? 800;
      const side = num(r[4]) ?? 0;
      if (!/^\d+-\d+$/.test(cowId)) {
        throw new WorkbookError(`Animals row ${line}: "${cowId}" is not a cow ID — they read like 3-201`);
      }
      if (kind.startsWith('lost')) {
        events.lost.push({ cowId, herdId: `H${cowId.split('-')[0]}`, fromDay });
      } else if (kind.startsWith('needs')) {
        events.needsAttention.push({ cowId, fromDay, awayM, side });
      } else if (kind.startsWith('drifted') || kind.startsWith('separated')) {
        events.separated.push({ cowId, fromDay, awayM, side });
      } else if (kind.startsWith('health') || kind.startsWith('welfare') || kind.startsWith('sick')) {
        events.welfare.push({ cowId, fromDay });
      } else {
        throw new WorkbookError(
          `Animals row ${line}: "${text(r[0])}" is not one of ${Object.values(ANIMAL_KINDS).join(', ')}`,
        );
      }
    }
    farm.animalEvents = events;
  }

  // ---- Weather ------------------------------------------------------------
  const weatherRows = body(get(SHEET.weather));
  if (weatherRows.length) {
    farm.weather = weatherRows.map((r, i) => ({
      day: num(r[0]) ?? i,
      date: dateText(r[1]),
      rainMm: num(r[2]) ?? 0,
      tempC: num(r[3]) ?? 15,
      windMs: num(r[4]) ?? 3,
    }));
  }

  if (farm.weather.length < farm.season.days) {
    throw new WorkbookError(
      `the season is ${farm.season.days} days but Weather has ${farm.weather.length} rows`,
    );
  }
  // herd numbering is fixed by row order, so rotations must point at areas that exist
  for (const h of farm.herds) {
    for (const id of h.rotation) {
      if (!areaIds.has(id)) throw new WorkbookError(`${h.name.en} grazes Area ${areaNumber(id)}, which is gone`);
    }
  }
  farm.$readme = defaultFarm.$readme;
  return farm;
}

