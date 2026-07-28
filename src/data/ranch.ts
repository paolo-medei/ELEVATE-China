import { makeRng } from '../lib/rng';
import { polygonCentroid, shoelaceArea } from '../lib/geo';
import type { Herd, Landmark, Paddock, Pt, SoilClass, WaterPoint } from './types';

/** Ranch extent in metres. The map is drawn in this local grid; lat/lon is derived. */
export const RANCH_W = 10800;
export const RANCH_H = 6480;

export const ORIGIN = { lat: 44.0912, lon: 116.0184 }; // NW corner, Xilingol steppe
export const M_PER_DEG_LAT = 111_320;
export const M_PER_DEG_LON = 80_000; // cos(44°) * 111.32 km

const COLS = 4;
const ROWS = 3;

/** Length of the warm-season grazing period, in days. */
export const SEASON_DAYS = 120;
/** Dry-matter intake per animal unit per day, including trampling and fouling losses. */
export const INTAKE_KG_AU_DAY = 11.5;
/**
 * Share of peak standing crop that may be removed across a season. Roughly half of the
 * edible yield, which is itself ~60% of standing crop — the rule of thumb behind China's
 * carrying-capacity standards for steppe.
 */
export const ALLOWABLE_USE = 0.3;

/** Peak standing crop per steppe type, kg dry matter / ha. */
const CEILING: Record<SoilClass, number> = {
  meadow: 1850,
  typical: 1250,
  sandy: 720,
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
  { name: { en: 'Area 4', zh: '4 号草场' }, soil: 'sandy' },
  { name: { en: 'Area 5', zh: '5 号草场' }, soil: 'sandy' },
  { name: { en: 'Area 6', zh: '6 号草场' }, soil: 'typical' },
  { name: { en: 'Area 7', zh: '7 号草场' }, soil: 'typical' },
  { name: { en: 'Area 8', zh: '8 号草场' }, soil: 'meadow' },
  { name: { en: 'Area 9', zh: '9 号草场' }, soil: 'meadow' },
  { name: { en: 'Area 10', zh: '10 号草场' }, soil: 'meadow' },
  { name: { en: 'Area 11', zh: '11 号草场' }, soil: 'sandy' },
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
  { id: 'W1', name: { en: 'North Ridge well', zh: '北梁机井' }, kind: 'well', at: { x: 1180, y: 1230 } },
  { id: 'W2', name: { en: 'Spring Pond', zh: '泉子泡子' }, kind: 'pond', at: { x: 4320, y: 1490 } },
  { id: 'W3', name: { en: 'Stone Well & trough', zh: '石头井水槽' }, kind: 'well', at: { x: 4180, y: 3260 } },
  { id: 'W4', name: { en: 'Salt Flat trough', zh: '碱滩水槽' }, kind: 'well', at: { x: 7250, y: 3120 } },
  { id: 'W5', name: { en: 'Willow Draw spring', zh: '柳条沟泉' }, kind: 'pond', at: { x: 9820, y: 2740 } },
  { id: 'W6', name: { en: 'River Bend crossing', zh: '河湾饮水点' }, kind: 'river', at: { x: 1500, y: 5460 } },
  { id: 'W7', name: { en: 'South trough', zh: '南滩水槽' }, kind: 'well', at: { x: 8250, y: 5180 } },
];

export const landmarks: Landmark[] = [
  { id: 'L1', name: { en: 'Home camp', zh: '牧户营地' }, kind: 'camp', at: { x: 5460, y: 5980 } },
  { id: 'L2', name: { en: 'Drone pad', zh: '无人机起降点' }, kind: 'dronePad', at: { x: 5780, y: 5840 } },
  { id: 'L3', name: { en: 'Handling yard', zh: '棚圈作业区' }, kind: 'handling', at: { x: 8600, y: 1120 } },
];

export const herds: Herd[] = [
  {
    id: 'H1',
    name: { en: 'Herd 1', zh: '1 号牛群' },
    breed: { en: 'Simmental × Mongolian', zh: '西门塔尔×蒙古牛' },
    head: 540,
    auPerHead: 1.0,
    color: 'h1',
    rotation: ['P1', 'P5', 'P9'],
  },
  {
    id: 'H2',
    name: { en: 'Herd 2', zh: '2 号牛群' },
    breed: { en: 'Angus × Mongolian', zh: '安格斯×蒙古牛' },
    head: 470,
    auPerHead: 1.0,
    color: 'h2',
    rotation: ['P2', 'P6', 'P10'],
  },
  {
    id: 'H3',
    name: { en: 'Herd 3', zh: '3 号牛群' },
    breed: { en: 'Simmental cross', zh: '西门塔尔杂交' },
    head: 400,
    auPerHead: 0.7,
    color: 'h3',
    rotation: ['P3', 'P7', 'P11'],
  },
  {
    id: 'H4',
    name: { en: 'Herd 4', zh: '4 号牛群' },
    breed: { en: 'Mongolian', zh: '蒙古牛' },
    head: 345,
    auPerHead: 1.15,
    color: 'h4',
    rotation: ['P4', 'P8', 'P12'],
  },
];

export const herdById = new Map(herds.map((h) => [h.id, h]));
export const TOTAL_HEAD = herds.reduce((a, h) => a + h.head, 0);
export const TOTAL_AU = herds.reduce((a, h) => a + h.head * h.auPerHead, 0);
export const RANCH_AREA_HA = paddocks.reduce((a, p) => a + p.areaHa, 0);
/** China's grass–livestock balance rules count in sheep units: 1 cattle AU = 5 SU. */
export const SHEEP_UNITS_PER_AU = 5;
export const QUOTA_SHEEP_UNITS = Math.round(
  paddocks.reduce((a, p) => a + p.areaHa * p.carryingCapacityAuHa, 0) * SHEEP_UNITS_PER_AU,
);
