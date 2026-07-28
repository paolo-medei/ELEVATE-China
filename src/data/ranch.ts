import { makeRng } from '../lib/rng';
import { polygonCentroid, shoelaceArea } from '../lib/geo';
import { FARM } from './source';
import type { Herd, Landmark, Paddock, Pt, SoilClass, WaterPoint } from './types';

/**
 * Study area: the Assy Plateau (Ассы жайлауы), Enbekshikazakh District, Almaty Region,
 * between the Turgen Gorge to the north-west and the Bartogai Reservoir to the east.
 * A classic summer pasture (jailau) at 1,900–2,700 m, grazed June to September.
 */
export const RANCH_W = FARM.meta.widthM;
export const RANCH_H = FARM.meta.heightM;

export const ORIGIN = { lat: FARM.meta.originLat, lon: FARM.meta.originLon };
export const M_PER_DEG_LAT = 111_320;
export const M_PER_DEG_LON =
  Math.cos((FARM.meta.originLat * Math.PI) / 180) * M_PER_DEG_LAT;

const COLS = FARM.meta.gridCols;
const ROWS = FARM.meta.gridRows;

/** Length of the warm-season grazing period, in days. */
export const SEASON_DAYS = FARM.season.days;
/** Dry-matter intake per animal unit per day, including trampling and fouling losses. */
export const INTAKE_KG_AU_DAY = FARM.forage.intakeKgPerAnimalPerDay;
/**
 * Share of peak standing crop that may be removed across a season — about half of the
 * edible yield, which is itself roughly 60% of what is standing.
 */
export const ALLOWABLE_USE = FARM.forage.allowableUse;

/**
 * Peak standing crop per pasture type on the plateau, kg dry matter / ha. Alpine meadow
 * on the valley floors is the productive ground; the stony slopes carry far less.
 */
const CEILING: Record<SoilClass, number> = FARM.forage.peakGrassKgPerHa;

/**
 * Carrying capacity follows from the forage budget rather than being asserted separately:
 * a hectare can carry the stock whose season-long intake equals its allowable offtake.
 */
const capacityFor = (soil: SoilClass) =>
  +((CEILING[soil] * ALLOWABLE_USE) / (INTAKE_KG_AU_DAY * SEASON_DAYS)).toFixed(3);

const PADDOCK_SPEC: { name: { en: string; zh: string }; soil: SoilClass }[] = FARM.areas.map(
  (a) => ({ name: a.name, soil: a.pasture as SoilClass }),
);

/**
 * Fence lines are built from one shared vertex/midpoint lattice so neighbouring
 * paddocks share their boundary exactly — no slivers, no overlaps.
 */
function buildPaddocks(): Paddock[] {
  const rng = makeRng(FARM.meta.layoutSeed);
  const cw = RANCH_W / COLS;
  const ch = RANCH_H / ROWS;
  const jx = cw * 0.11;
  const jy = ch * 0.11;

  const corner: Pt[][] = [];
  for (let c = 0; c <= COLS; c++) {
    corner[c] = [];
    for (let r = 0; r <= ROWS; r++) {
      const edgeX = c === 0 || c === COLS;
      const edgeY = r === 0 || r === ROWS;
      corner[c][r] = {
        x: c * cw + (edgeX ? 0 : rng.gauss(0, jx * 0.6)),
        y: r * ch + (edgeY ? 0 : rng.gauss(0, jy * 0.6)),
      };
    }
  }

  const mid = (a: Pt, b: Pt, amp: number): Pt => {
    const nx = -(b.y - a.y);
    const ny = b.x - a.x;
    const len = Math.hypot(nx, ny) || 1;
    const k = rng.gauss(0, amp);
    return { x: (a.x + b.x) / 2 + (nx / len) * k, y: (a.y + b.y) / 2 + (ny / len) * k };
  };

  // shared edge midpoints: hMid[c][r] rides the top edge of cell (c,r)
  const hMid: Pt[][] = [];
  for (let c = 0; c < COLS; c++) {
    hMid[c] = [];
    for (let r = 0; r <= ROWS; r++) {
      hMid[c][r] = mid(corner[c][r], corner[c + 1][r], r === 0 || r === ROWS ? 60 : 150);
    }
  }
  const vMid: Pt[][] = [];
  for (let c = 0; c <= COLS; c++) {
    vMid[c] = [];
    for (let r = 0; r < ROWS; r++) {
      vMid[c][r] = mid(corner[c][r], corner[c][r + 1], c === 0 || c === COLS ? 60 : 150);
    }
  }

  const paddocks: Paddock[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      const spec = PADDOCK_SPEC[idx];
      const polygon: Pt[] = [
        corner[c][r],
        hMid[c][r],
        corner[c + 1][r],
        vMid[c + 1][r],
        corner[c + 1][r + 1],
        hMid[c][r + 1],
        corner[c][r + 1],
        vMid[c][r],
      ];
      const areaHa = shoelaceArea(polygon) / 10_000;
      paddocks.push({
        id: `P${idx + 1}`,
        code: `A${idx + 1}`,
        name: spec.name,
        polygon,
        centroid: polygonCentroid(polygon),
        areaHa: Math.round(areaHa),
        soil: spec.soil,
        carryingCapacityAuHa: capacityFor(spec.soil),
        biomassCeiling: CEILING[spec.soil],
      });
    }
  }
  return paddocks;
}

export const paddocks = buildPaddocks();
export const paddockById = new Map(paddocks.map((p) => [p.id, p]));

/**
 * Ground height in metres. The plateau floor sits near 1,900 m and rises to the Zailiysky
 * Alatau ridges in the south and the observatory shoulder in the north-west.
 */
const HILLS = [
  { x: 1700, y: 900, r: 2500, h: 690 },
  { x: 5400, y: 6600, r: 3200, h: 640 },
  { x: 9600, y: 1100, r: 2600, h: 430 },
  { x: 7600, y: 3200, r: 2200, h: 180 },
];

export const elevationAt = (p: Pt) =>
  Math.round(
    1905 +
      HILLS.reduce(
        (a, h) => a + h.h * Math.exp(-((p.x - h.x) ** 2 + (p.y - h.y) ** 2) / (2 * h.r ** 2)),
        0,
      ),
  );

export const riverPath: Pt[] = [
  { x: -200, y: 5020 },
  { x: 1400, y: 5420 },
  { x: 2800, y: 5350 },
  { x: 4200, y: 5860 },
  { x: 5700, y: 6100 },
  { x: 7400, y: 6240 },
  { x: 9200, y: 6340 },
  { x: 11000, y: 6420 },
];

export const water: WaterPoint[] = FARM.waterPoints.map((w) => ({
  id: w.id,
  name: w.name,
  kind: w.kind as WaterPoint['kind'],
  at: { x: w.x, y: w.y },
}));

export const landmarks: Landmark[] = FARM.places.map((l) => ({
  id: l.id,
  name: l.name,
  kind: l.kind as Landmark['kind'],
  at: { x: l.x, y: l.y },
}));

export const herds: Herd[] = FARM.herds.map((h, i) => ({
  id: h.id,
  name: h.name,
  breed: { en: '', zh: '' },
  head: h.head,
  auPerHead: h.animalUnitsPerHead,
  color: `h${i + 1}`,
  rotation: h.rotation,
}));

/** how long each herd stays in one area, and where its cycle starts */
export const ROTATION = FARM.herds.map((h) => ({
  daysPerArea: h.daysPerArea,
  offset: h.rotationOffset,
}));

/**
 * Animals that have genuinely gone missing and stay missing. The flight count subtracts
 * them and the per-animal view marks them, so both tell the same story.
 */
export const LOST_ANIMALS: { cowId: string; herdId: string; fromDay: number }[] =
  FARM.animalEvents.lost;

export const lostOn = (herdId: string, day: number) =>
  LOST_ANIMALS.filter((l) => l.herdId === herdId && day >= l.fromDay);

export const herdById = new Map(herds.map((h) => [h.id, h]));
export const TOTAL_HEAD = herds.reduce((a, h) => a + h.head, 0);
export const TOTAL_AU = herds.reduce((a, h) => a + h.head * h.auPerHead, 0);
export const RANCH_AREA_HA = paddocks.reduce((a, p) => a + p.areaHa, 0);
/** China's grass–livestock balance rules count in sheep units: 1 cattle AU = 5 SU. */
export const SHEEP_UNITS_PER_AU = 5;
export const QUOTA_SHEEP_UNITS = Math.round(
  paddocks.reduce((a, p) => a + p.areaHa * p.carryingCapacityAuHa, 0) * SHEEP_UNITS_PER_AU,
);
