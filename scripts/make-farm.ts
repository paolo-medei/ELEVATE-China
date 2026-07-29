/**
 * Writes src/data/farm.json — the input database the whole app reads.
 *
 * Run once to freeze the generated weather series and the farm layout into an editable
 * file. After that, farm.json is the source of truth: edit it (or load a copy through
 * the Data menu in the app) and every number, map and chart follows.
 *
 *   npm run make-farm
 */
import { writeFileSync } from 'node:fs';
import { makeRng } from '../src/lib/rng';
import { buildWeather, START_DATE } from '../src/data/simulate';
import {
  ALLOWABLE_USE,
  INTAKE_KG_AU_DAY,
  ORIGIN,
  SEASON_DAYS,
  RANCH_H,
  RANCH_W,
  ROTATION,
  herds,
  landmarks,
  paddocks,
  water,
} from '../src/data/ranch';

// the file holds the whole planned grazing period; the app reads it up to today
const weather = buildWeather(makeRng(880517), SEASON_DAYS).map((w) => ({
  day: w.day,
  date: w.date,
  rainMm: w.rainMm,
  tempC: w.tempC,
  windMs: w.windMs,
}));

const farm = {
  $readme: {
    what: "Input database for Farmers' Wingman. Every number, map, chart and alert in the app is computed from this file — nothing else is stored.",
    how: 'Most people should use the spreadsheet instead: in the app, Data → Get the Excel file. To edit this file directly, change a value and load it back under Data → For developers.',
    meta: 'Where the pasture is and how big it is. gridCols × gridRows must equal the number of areas; layoutSeed redraws the fence lines.',
    season: 'First day of grazing and how many days it runs. weather must have at least that many entries.',
    forage: 'The grass budget. peakGrassKgPerHa sets how much each pasture type grows; allowableUse and intake set how many animals a hectare can carry.',
    flights: 'Drone schedule and limits. The first hour is the counting mission; wind above groundedAboveWindMs cancels the day, above shortenedAboveWindMs cuts it short. baseMissRate is how often a visible animal is missed.',
    areas: 'One entry per grazing area. pasture is meadow (best), typical, or sandy (poorest) — change it and the grass, the Green Index and the overgrazing alerts all move.',
    herds: 'Herd size, the areas it rotates through, how many days it stays in each, and where in the cycle it starts.',
    animalEvents: 'Who the system flags. lost = gone and still gone. The perDay rates open new incidents day by day, each lasting a few days, so today\'s list is never yesterday\'s; the lists name a particular animal on a particular day on top of that.',
    weather: 'One row per day. Rain drives grass growth, temperature drives grazing hours, wind decides whether the drone flies.',
  },

  meta: {
    farm: { en: 'Assy Plateau summer pasture', zh: '阿瑟高原夏季牧场' },
    region: { en: 'Enbekshikazakh District, Almaty Region', zh: '阿拉木图州 恩别克什哈萨克区' },
    originLat: ORIGIN.lat,
    originLon: ORIGIN.lon,
    widthM: RANCH_W,
    heightM: RANCH_H,
    /** the areas below are laid out on this grid, so cols × rows must equal their count */
    gridCols: 4,
    gridRows: 3,
    layoutSeed: 20260615,
  },

  season: { startDate: START_DATE.toISOString().slice(0, 10), days: SEASON_DAYS },

  forage: {
    allowableUse: ALLOWABLE_USE,
    intakeKgPerAnimalPerDay: INTAKE_KG_AU_DAY,
    peakGrassKgPerHa: { meadow: 2250, typical: 1550, sandy: 780 },
  },

  flights: {
    hours: [6, 17],
    groundedAboveWindMs: 11,
    shortenedAboveWindMs: 9,
    baseMissRate: 0.0012,
  },

  /** hectares are not listed: they come from the fence lines the layout draws */
  areas: paddocks.map((p) => ({
    id: p.id,
    name: p.name,
    pasture: p.soil,
  })),

  herds: herds.map((h, i) => ({
    id: h.id,
    name: h.name,
    head: h.head,
    animalUnitsPerHead: h.auPerHead,
    rotation: h.rotation,
    daysPerArea: ROTATION[i].daysPerArea,
    rotationOffset: ROTATION[i].offset,
  })),

  /**
   * Who the system flags, and how often.
   *
   * `lost` animals stay lost — that is the case the whole thing exists for. Everything
   * else comes and goes: the rates below open new incidents day by day, each lasting a
   * few days, so today's list is never yesterday's. The four lists are for naming a
   * particular animal on a particular day on top of that.
   */
  animalEvents: {
    seed: 5150724,
    /** chance of a new incident of each kind opening on any given day */
    perDay: { needsAttention: 0.55, separated: 0.75, welfare: 0.4 },
    lost: [{ cowId: '3-201', herdId: 'H3', fromDay: 34 }],
    needsAttention: [] as { cowId: string; fromDay: number; days: number; awayM: number; side: number }[],
    separated: [] as { cowId: string; fromDay: number; days: number; awayM: number; side: number }[],
    welfare: [] as { cowId: string; fromDay: number; days: number }[],
  },

  waterPoints: water.map((w) => ({ id: w.id, name: w.name, kind: w.kind, x: w.at.x, y: w.at.y })),
  places: landmarks.map((l) => ({ id: l.id, name: l.name, kind: l.kind, x: l.at.x, y: l.at.y })),

  weather,
};

writeFileSync('src/data/farm.json', `${JSON.stringify(farm, null, 2)}\n`);
console.log(
  `src/data/farm.json — ${farm.areas.length} areas, ${farm.herds.length} herds, ${weather.length} days of weather`,
);
