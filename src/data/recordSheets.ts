import { toLatLon } from '../lib/geo';
import { cowSnapshot, elevationAt } from './animals';
import type { Dataset } from './types';
import { NOTE, type Sheet, header } from './workbookLayout';

/**
 * The measurement sheets — the bulk of the workbook and the reason it exists.
 *
 * Where the settings sheets hold a few dozen knobs, these hold the record: a row for every
 * animal on every flight with its coordinates, a row for every area on every day with its
 * green index, a row for every mission, count, and herd-day. Three of them read back into
 * the app, so a corrected coordinate or count changes what the screens show.
 */

/** How much of the per-animal record to write out. */
export type Depth = 'fortnight' | 'season';

export const firstDayOf = (data: Dataset, depth: Depth) =>
  depth === 'season' ? 0 : Math.max(0, data.meta.days - 14);

/** The record half of the workbook, in the order it reads best. */
export function recordSheets(data: Dataset, depth: Depth): Sheet[] {
  return [
    countSheet(data),
    grasslandSheet(data),
    cowSheet(data, firstDayOf(data, depth)),
    herdDaySheet(data),
    flightSheet(data),
    boundarySheet(data),
  ];
}

export const RECORD_SHEET = {
  cows: 'Cow positions',
  grassland: 'Grassland',
  counts: 'Counts',
  flights: 'Flights',
  herdDays: 'Herd days',
  boundaries: 'Area boundaries',
} as const;

const READS_BACK = 'The app reads this sheet back: change a value and the screens follow.';
const RECORD_ONLY = 'A record of what the app worked out. Editing it changes nothing.';

/** Every flight in the season, oldest first, so a row number is a date. */
export function flightSheet(data: Dataset): Sheet {
  const name = (id: string) => data.paddocks.find((p) => p.id === id)?.name.en ?? id;
  return {
    sheet: RECORD_SHEET.flights,
    columns: [
      { width: 13 }, { width: 12 }, { width: 7 }, { width: 11 }, { width: 12 },
      { width: 13 }, { width: 10 }, { width: 11 }, { width: 11 }, { width: 12 }, { width: 34 },
    ],
    data: [
      header(
        'Flight', 'Date', 'Hour', 'Status', 'Minutes', 'Hectares flown',
        'Images', 'Battery %', 'Wind (m/s)', 'Temp (°C)', 'Areas flown',
      ),
      ...data.flights.map((f) => [
        { value: f.id },
        { value: data.weather[f.day].date },
        { value: f.hour, type: Number },
        { value: f.status },
        { value: f.durationMin, type: Number },
        { value: f.coverageHa, type: Number },
        { value: f.images, type: Number },
        { value: f.batteryPct, type: Number },
        { value: f.windMs, type: Number },
        { value: f.tempC, type: Number },
        { value: f.paddockIds.map(name).join(', ') },
      ]),
      [],
      [{ value: RECORD_ONLY, ...NOTE }],
      [{ value: 'Whether a flight goes up is decided by the wind on the Weather sheet.', ...NOTE }],
    ],
  };
}

/** What each counting flight reported, per herd — the measurement the app trusts most. */
export function countSheet(data: Dataset): Sheet {
  const herdName = (id: string) => data.herds.find((h) => h.id === id)?.name.en ?? id;
  const rows = data.flights.flatMap((f) =>
    f.detections.map((d) => [
      { value: data.weather[f.day].date },
      { value: f.day, type: Number },
      { value: f.hour, type: Number },
      { value: herdName(d.herdId) },
      { value: d.expected, type: Number },
      { value: d.detected, type: Number },
      { value: d.expected - d.detected, type: Number },
      { value: d.confidencePct, type: Number },
      { value: d.flagged, type: Number },
    ]),
  );
  return {
    sheet: RECORD_SHEET.counts,
    columns: [
      { width: 12 }, { width: 7 }, { width: 7 }, { width: 11 },
      { width: 12 }, { width: 11 }, { width: 10 }, { width: 13 }, { width: 10 },
    ],
    data: [
      header('Date', 'Day', 'Hour', 'Herd', 'On the books', 'Counted', 'Missing', 'Confidence %', 'Flagged'),
      ...rows,
      [],
      [{ value: READS_BACK, ...NOTE }],
      [{ value: '"Counted" is what the flight found. Lower it and the herd shows animals missing.', ...NOTE }],
    ],
  };
}

/** Green index and standing grass for every area on every day of the season. */
export function grasslandSheet(data: Dataset): Sheet {
  const name = (id: string) => data.paddocks.find((p) => p.id === id)?.name.en ?? id;
  const haOf = (id: string) => data.paddocks.find((p) => p.id === id)?.areaHa ?? 0;
  return {
    sheet: RECORD_SHEET.grassland,
    columns: [
      { width: 12 }, { width: 7 }, { width: 11 }, { width: 10 }, { width: 14 },
      { width: 17 }, { width: 14 }, { width: 11 }, { width: 15 }, { width: 14 }, { width: 13 },
    ],
    data: [
      header(
        'Date', 'Day', 'Area', 'Hectares', 'Green index',
        'Grass (kg/ha)', 'Grass eaten %', 'Rest days', 'Cattle per ha', 'Grazed hours', 'Health score',
      ),
      ...data.paddockDays.map((pd) => [
        { value: data.weather[pd.day].date },
        { value: pd.day, type: Number },
        { value: name(pd.paddockId) },
        { value: haOf(pd.paddockId), type: Number },
        { value: pd.ndvi, type: Number },
        { value: pd.biomass, type: Number },
        { value: +(pd.utilization * 100).toFixed(1), type: Number },
        { value: pd.restDays, type: Number },
        { value: pd.stockingAuHa, type: Number },
        { value: pd.grazedHours, type: Number },
        { value: pd.healthIndex, type: Number },
      ]),
      [],
      [{ value: READS_BACK, ...NOTE }],
      [{ value: 'Green index runs 0 to 1: 0.8 is lush, 0.2 is bare ground. Grass is dry matter per hectare.', ...NOTE }],
    ],
  };
}

/** One row per herd per day: how far it walked and how it spent the 24 hours. */
export function herdDaySheet(data: Dataset): Sheet {
  const herdName = (id: string) => data.herds.find((h) => h.id === id)?.name.en ?? id;
  const areaName = (id: string) => data.paddocks.find((p) => p.id === id)?.name.en ?? id;
  const h = (minutes: number) => +(minutes / 60).toFixed(1);
  return {
    sheet: RECORD_SHEET.herdDays,
    columns: [
      { width: 12 }, { width: 7 }, { width: 11 }, { width: 11 }, { width: 12 },
      { width: 11 }, { width: 12 }, { width: 11 }, { width: 12 }, { width: 11 },
      { width: 14 }, { width: 13 }, { width: 12 },
    ],
    data: [
      header(
        'Date', 'Day', 'Herd', 'Area', 'Walked (km)',
        'Grazing (h)', 'Chewing (h)', 'Resting (h)', 'Walking (h)', 'Drinking (h)',
        'Ground used (ha)', 'Spread (m)', 'Water visits',
      ),
      ...data.herdDays.map((hd) => [
        { value: data.weather[hd.day].date },
        { value: hd.day, type: Number },
        { value: herdName(hd.herdId) },
        { value: areaName(hd.paddockId) },
        { value: hd.distanceKm, type: Number },
        { value: h(hd.budget.grazing), type: Number },
        { value: h(hd.budget.ruminating), type: Number },
        { value: h(hd.budget.resting), type: Number },
        { value: h(hd.budget.travelling), type: Number },
        { value: h(hd.budget.watering), type: Number },
        { value: hd.areaUsedHa, type: Number },
        { value: hd.meanSpreadM, type: Number },
        { value: hd.waterVisits, type: Number },
      ]),
      [],
      [{ value: RECORD_ONLY, ...NOTE }],
    ],
  };
}

/** The fence lines as coordinates, so an area can be checked against a real map. */
export function boundarySheet(data: Dataset): Sheet {
  const ll = (p: { x: number; y: number }) =>
    toLatLon(p, data.meta.origin, data.meta.metresPerDegLat, data.meta.metresPerDegLon);
  const rows = data.paddocks.flatMap((p) =>
    p.polygon.map((pt, i) => [
      { value: p.name.en },
      { value: i + 1, type: Number },
      { value: +ll(pt).lat.toFixed(6), type: Number },
      { value: +ll(pt).lon.toFixed(6), type: Number },
      { value: elevationAt(pt), type: Number },
    ]),
  );
  return {
    sheet: RECORD_SHEET.boundaries,
    columns: [{ width: 11 }, { width: 9 }, { width: 13 }, { width: 13 }, { width: 13 }],
    data: [
      header('Area', 'Corner', 'Latitude', 'Longitude', 'Height (m)'),
      ...rows,
      [],
      [{ value: RECORD_ONLY, ...NOTE }],
      [{ value: 'Corners run clockwise from the north-west. Paste them into any GIS to check the fences.', ...NOTE }],
    ],
  };
}

/**
 * Every animal, on every flight, with where it was.
 *
 * This is the big one — the roster times the flights in the window. `days` bounds it: the
 * whole season is a quarter of a million rows, which Excel holds but takes a while to
 * write, so the app offers a recent window as well.
 */
export function cowSheet(data: Dataset, fromDay: number): Sheet {
  const areaName = (id: string) => data.paddocks.find((p) => p.id === id)?.name.en ?? id;
  const rows: Sheet['data'] = [];

  for (let day = fromDay; day < data.meta.days; day++) {
    const flights = data.flights.filter((f) => f.day === day && f.status !== 'aborted');
    for (const flight of flights) {
      const states = cowSnapshot(data, day, flight.hour);
      const stepFor = new Map(data.stepIndex[day][flight.hour].map((s) => [s.herdId, s]));
      for (const s of states) {
        const ll = toLatLon(s.at, data.meta.origin, data.meta.metresPerDegLat, data.meta.metresPerDegLon);
        const step = stepFor.get(s.cow.herdId);
        rows.push([
          { value: s.cow.id },
          { value: `Herd ${s.cow.id.split('-')[0]}` },
          { value: data.weather[day].date },
          { value: day, type: Number },
          { value: flight.hour, type: Number },
          { value: flight.id },
          { value: +ll.lat.toFixed(6), type: Number },
          { value: +ll.lon.toFixed(6), type: Number },
          { value: elevationAt(s.at), type: Number },
          { value: step ? areaName(step.paddockId) : '' },
          { value: s.detected ? 'yes' : 'no' },
          { value: s.confidencePct, type: Number },
          { value: s.fromHerdM, type: Number },
          { value: s.distanceKm, type: Number },
          { value: s.stillHours, type: Number },
          { value: s.flags.join(', ') },
        ]);
      }
    }
  }

  return {
    sheet: RECORD_SHEET.cows,
    columns: [
      { width: 9 }, { width: 9 }, { width: 12 }, { width: 6 }, { width: 6 }, { width: 11 },
      { width: 13 }, { width: 13 }, { width: 11 }, { width: 11 }, { width: 10 },
      { width: 13 }, { width: 15 }, { width: 13 }, { width: 12 }, { width: 24 },
    ],
    data: [
      header(
        'Cow ID', 'Herd', 'Date', 'Day', 'Hour', 'Flight',
        'Latitude', 'Longitude', 'Height (m)', 'Area', 'Seen',
        'Confidence %', 'Metres from herd', 'Walked (km)', 'Still (h)', 'Flags',
      ),
      ...rows,
      [],
      [{ value: READS_BACK, ...NOTE }],
      [{ value: 'One row per animal per flight. Move a coordinate and that animal moves on the map; set Seen to no and it counts as missing.', ...NOTE }],
    ],
  };
}
