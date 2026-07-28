import { makeRng } from '../lib/rng';
import { polygonCentroid, shoelaceArea } from '../lib/geo';
import type { Herd, Landmark, Paddock, Pt, SoilClass, WaterPoint } from './types';

/**
 * Study area: the Assy Plateau (Ассы жайлауы), Enbekshikazakh District, Almaty Region,
 * between the Turgen Gorge to the north-west and the Bartogai Reservoir to the east.
 * A classic summer pasture (jailau) at 1,900–2,700 m, grazed June to September.
 */
export const RANCH_W = 10800;
export const RANCH_H = 6480;

export const ORIGIN = { lat: 43.2814, lon: 77.7396 }; // NW corner of the study area
export const M_PER_DEG_LAT = 111_320;
export const M_PER_DEG_LON = 81_060; // cos(43.25°) * 111.32 km

const COLS = 4;
const ROWS = 3;

/** Length of the warm-season grazing period, in days. */
export const SEASON_DAYS = 120;
/** Dry-matter intake per animal unit per day, including trampling and fouling losses. */
export const INTAKE_KG_AU_DAY = 11.5;
/**
 * Share of peak standing crop that may be removed across a season — about half of the
 * edible yield, which is itself roughly 60% of what is standing.
 */
export const ALLOWABLE_USE = 0.3;

/**
 * Peak standing crop per pasture type on the plateau, kg dry matter / ha. Alpine meadow
 * on the valley floors is the productive ground; the stony slopes carry far less.
 */
const CEILING: Record<SoilClass, number> = {
  meadow: 2250,
  typical: 1550,
  sandy: 780,
};

/**
 * Carrying capacity follows from the forage budget rather than being asserted separately:
 * a hectare can carry the stock whose season-long intake equals its allowable offtake.
 */
const capacityFor = (soil: SoilClass) =>
  +((CEILING[soil] * ALLOWABLE_USE) / (INTAKE_KG_AU_DAY * SEASON_DAYS)).toFixed(3);

const PADDOCK_SPEC: { name: { en: string; zh: string }; soil: SoilClass }[] = [
  { name: { en: 'Area 1', zh: '1 号草场' }, soil: 'typical' },
  { name: { en: 'Area 2', zh: '2 号草场' }, soil: 'meadow' },
  { name: { en: 'Area 3', zh: '3 号草场' }, soil: 'typical' },
  { name: { en: 'Area 4', zh: '4 号草场' }, soil: 'typical' },
  { name: { en: 'Area 5', zh: '5 号草场' }, soil: 'sandy' },
  { name: { en: 'Area 6', zh: '6 号草场' }, soil: 'typical' },
  { name: { en: 'Area 7', zh: '7 号草场' }, soil: 'typical' },
  { name: { en: 'Area 8', zh: '8 号草场' }, soil: 'meadow' },
  { name: { en: 'Area 9', zh: '9 号草场' }, soil: 'meadow' },
  { name: { en: 'Area 10', zh: '10 号草场' }, soil: 'meadow' },
  { name: { en: 'Area 11', zh: '11 号草场' }, soil: 'meadow' },
  { name: { en: 'Area 12', zh: '12 号草场' }, soil: 'typical' },
];

/**
 * Fence lines are built from one shared vertex/midpoint lattice so neighbouring
 * paddocks share their boundary exactly — no slivers, no overlaps.
 */
function buildPaddocks(): Paddock[] {
  const rng = makeRng(20260615);
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

export const water: WaterPoint[] = [
  { id: 'W1', name: { en: 'Assy River ford', zh: '阿瑟河渡口' }, kind: 'river', at: { x: 2450, y: 4560 } },
  { id: 'W2', name: { en: 'North spring', zh: '北泉' }, kind: 'pond', at: { x: 3980, y: 1320 } },
  { id: 'W3', name: { en: 'Kuray spring', zh: '库赖泉' }, kind: 'pond', at: { x: 6900, y: 2680 } },
  { id: 'W4', name: { en: 'Assy River bend', zh: '阿瑟河湾' }, kind: 'river', at: { x: 5600, y: 5180 } },
  { id: 'W5', name: { en: 'Bartogai inlet', zh: '巴尔托盖水库入口' }, kind: 'river', at: { x: 9750, y: 5450 } },
]

export const landmarks: Landmark[] = [
  { id: 'L1', name: { en: 'Summer camp', zh: '夏季牧点' }, kind: 'camp', at: { x: 4980, y: 4230 } },
  { id: 'L2', name: { en: 'Drone pad', zh: '无人机起降点' }, kind: 'dronePad', at: { x: 5240, y: 4090 } },
  { id: 'L3', name: { en: 'Assy-Turgen Observatory', zh: '阿瑟-图尔根天文台' }, kind: 'handling', at: { x: 1850, y: 980 } },
]

export const herds: Herd[] = [
  {
    id: 'H1',
    name: { en: 'Herd 1', zh: '1 号牛群' },
    breed: { en: 'Simmental × Mongolian', zh: '西门塔尔×蒙古牛' },
    head: 405,
    auPerHead: 1.0,
    color: 'h1',
    rotation: ['P1', 'P5', 'P9'],
  },
  {
    id: 'H2',
    name: { en: 'Herd 2', zh: '2 号牛群' },
    breed: { en: 'Angus × Mongolian', zh: '安格斯×蒙古牛' },
    head: 355,
    auPerHead: 1.0,
    color: 'h2',
    rotation: ['P2', 'P6', 'P10'],
  },
  {
    id: 'H3',
    name: { en: 'Herd 3', zh: '3 号牛群' },
    breed: { en: 'Simmental cross', zh: '西门塔尔杂交' },
    head: 300,
    auPerHead: 0.7,
    color: 'h3',
    rotation: ['P3', 'P7', 'P11'],
  },
  {
    id: 'H4',
    name: { en: 'Herd 4', zh: '4 号牛群' },
    breed: { en: 'Mongolian', zh: '蒙古牛' },
    head: 260,
    auPerHead: 1.15,
    color: 'h4',
    rotation: ['P4', 'P8', 'P12'],
  },
];

/**
 * Animals that have genuinely gone missing and stay missing. The flight count subtracts
 * them and the per-animal view marks them, so both tell the same story.
 */
export const LOST_ANIMALS: { cowId: string; herdId: string; fromDay: number }[] = [
  { cowId: '3-201', herdId: 'H3', fromDay: 74 },
];

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
