import type { Sheet as WriteSheet } from 'write-excel-file/browser';
import type { Farm } from './source';

/**
 * How the database is laid out as a spreadsheet: five sheets, one per topic, with the
 * column headings a farmer reads and the notes that explain them. Kept apart from the
 * reader and the browser download so a build script can write the very same workbook.
 */
export type Sheet = WriteSheet<File | Blob | ArrayBuffer>;

export const SHEET = {
  farm: 'Farm',
  areas: 'Areas',
  herds: 'Herds',
  animals: 'Animals to watch',
  weather: 'Weather',
} as const;

export const HEAD = { fontWeight: 'bold' as const, backgroundColor: '#e8eef5' };
export const NOTE = { color: '#666666', fontSize: 10 };

/* ------------------------------------------------------------------ writing */

/** Settings live as label/value pairs so nobody has to remember a column order. */
const settingRows = (f: Farm) => [
  ['Farm name', f.meta.farm.en, 'Shown in the header of the app'],
  ['Region', f.meta.region.en, 'Shown under the farm name'],
  ['Season starts', f.season.startDate, 'First day of grazing, as YYYY-MM-DD'],
  ['Season length (days)', f.season.days, 'Must match the number of rows in Weather'],
  ['Grass on best pasture (kg/ha)', f.forage.peakGrassKgPerHa.meadow, 'Peak growth on meadow'],
  ['Grass on typical pasture (kg/ha)', f.forage.peakGrassKgPerHa.typical, 'Peak growth on typical ground'],
  ['Grass on poor pasture (kg/ha)', f.forage.peakGrassKgPerHa.sandy, 'Peak growth on sandy ground'],
  ['Grass one cow eats per day (kg)', f.forage.intakeKgPerAnimalPerDay, 'Including what is trampled'],
  ['Share of the grass that may be eaten', f.forage.allowableUse, 'Between 0 and 1 — 0.3 leaves the sward to recover'],
  ['Drone flight hours', f.flights.hours.join(', '), 'The first one is the counting flight'],
  ['Wind that grounds the drone (m/s)', f.flights.groundedAboveWindMs, 'Above this the day has no count'],
  ['Wind that shortens the flight (m/s)', f.flights.shortenedAboveWindMs, 'Above this the round is cut short'],
  ['Cattle the camera misses (share)', f.flights.baseMissRate, '0.0012 means about 1 in 800'],
  ['Map layout number', f.meta.layoutSeed, 'Change it to redraw the fence lines'],
];

export const areaNumber = (id: string) => Number(id.replace(/\D/g, '')) || 0;

export const ANIMAL_KINDS = {
  lost: 'Lost',
  needsAttention: 'Needs attention',
  separated: 'Drifted from the group',
  welfare: 'Health check',
} as const;

function animalRows(f: Farm) {
  const rows: (string | number | null)[][] = [];
  for (const a of f.animalEvents.lost) rows.push([ANIMAL_KINDS.lost, a.cowId, a.fromDay, null, null]);
  for (const a of f.animalEvents.needsAttention)
    rows.push([ANIMAL_KINDS.needsAttention, a.cowId, a.fromDay, a.awayM, a.side]);
  for (const a of f.animalEvents.separated)
    rows.push([ANIMAL_KINDS.separated, a.cowId, a.fromDay, a.awayM, a.side]);
  for (const a of f.animalEvents.welfare)
    rows.push([ANIMAL_KINDS.welfare, a.cowId, a.fromDay, null, null]);
  return rows;
}

export const header = (...cells: string[]) => cells.map((value) => ({ value, ...HEAD }));

/** The five sheets of the workbook, laid out from a database. */
export function workbookSheets(f: Farm): Sheet[] {
  const farmSheet: Sheet = {
    sheet: SHEET.farm,
    columns: [{ width: 38 }, { width: 30 }, { width: 52 }],
    data: [
      header('Setting', 'Value', 'What it does'),
      ...settingRows(f).map(([label, value, note]) => [
        { value: String(label) },
        typeof value === 'number' ? { value, type: Number } : { value: String(value) },
        { value: String(note), ...NOTE },
      ]),
      [],
      [{ value: 'Change a value in column B, save the file, then load it back into the app.', ...NOTE }],
    ],
  };

  const areasSheet: Sheet = {
    sheet: SHEET.areas,
    columns: [{ width: 16 }, { width: 34 }],
    data: [
      header('Area', 'Grass type (meadow / typical / sandy)'),
      ...f.areas.map((a) => [{ value: a.name.en }, { value: a.pasture }]),
      [],
      [{ value: 'meadow = best ground · typical = average · sandy = poorest', ...NOTE }],
    ],
  };

  const herdsSheet: Sheet = {
    sheet: SHEET.herds,
    columns: [{ width: 16 }, { width: 12 }, { width: 24 }, { width: 22 }, { width: 16 }],
    data: [
      header('Herd', 'Cattle', 'Grazes areas', 'Days in each area', 'Starts at day'),
      ...f.herds.map((h) => [
        { value: h.name.en },
        { value: h.head, type: Number },
        { value: h.rotation.map(areaNumber).join(', ') },
        { value: h.daysPerArea, type: Number },
        { value: h.rotationOffset, type: Number },
      ]),
      [],
      [{ value: '"Grazes areas" is a list of area numbers, e.g. 1, 5, 9 — the herd moves round them in that order.', ...NOTE }],
    ],
  };

  const animalsSheet: Sheet = {
    sheet: SHEET.animals,
    columns: [{ width: 24 }, { width: 12 }, { width: 12 }, { width: 20 }, { width: 20 }],
    data: [
      header('What', 'Cow ID', 'From day', 'Metres from the herd', 'Metres sideways'),
      ...animalRows(f).map((r) =>
        r.map((value, i) =>
          value === null ? null : i === 0 || i === 1 ? { value: String(value) } : { value: Number(value), type: Number },
        ),
      ),
      [],
      [{ value: 'What: Lost · Needs attention · Drifted from the group · Health check. Cow ID reads "herd-number", e.g. 3-201.', ...NOTE }],
      [{ value: 'The last two columns place the animal on the map and only apply to the middle two kinds.', ...NOTE }],
    ],
  };

  const weatherSheet: Sheet = {
    sheet: SHEET.weather,
    columns: [{ width: 8 }, { width: 14 }, { width: 12 }, { width: 18 }, { width: 14 }],
    data: [
      header('Day', 'Date', 'Rain (mm)', 'Temperature (°C)', 'Wind (m/s)'),
      ...f.weather.map((w) => [
        { value: w.day, type: Number },
        { value: w.date },
        { value: w.rainMm, type: Number },
        { value: w.tempC, type: Number },
        { value: w.windMs, type: Number },
      ]),
    ],
  };

  return [farmSheet, areasSheet, herdsSheet, animalsSheet, weatherSheet];
}

