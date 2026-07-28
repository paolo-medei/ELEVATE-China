export type Bilingual = { en: string; zh: string };

export type Pt = { x: number; y: number };

export type SoilClass = 'meadow' | 'typical' | 'sandy';

export type Paddock = {
  id: string;
  code: string;
  name: Bilingual;
  polygon: Pt[];
  centroid: Pt;
  areaHa: number;
  soil: SoilClass;
  /** Regulator-approved carrying capacity, animal units per hectare. */
  carryingCapacityAuHa: number;
  /** Peak standing biomass the site can hold, kg dry matter / ha. */
  biomassCeiling: number;
};

export type WaterPoint = {
  id: string;
  name: Bilingual;
  kind: 'well' | 'pond' | 'river';
  at: Pt;
};

export type Landmark = {
  id: string;
  name: Bilingual;
  kind: 'camp' | 'dronePad' | 'handling';
  at: Pt;
};

export type Herd = {
  id: string;
  name: Bilingual;
  breed: Bilingual;
  head: number;
  /** Animal units — calves and heifers weigh less than a mature cow. */
  auPerHead: number;
  color: string;
  /** Paddocks this herd rotates through, in order. */
  rotation: string[];
};

export type BehaviourState = 'grazing' | 'ruminating' | 'resting' | 'travelling' | 'watering';

export type HerdStep = {
  herdId: string;
  /** hours since the start of the season window */
  t: number;
  day: number;
  hour: number;
  at: Pt;
  /** radius in metres containing ~90% of the animals */
  spreadM: number;
  state: BehaviourState;
  paddockId: string;
  /** true when the herd centroid has left its assigned paddock */
  offPaddock: boolean;
};

export type HerdDay = {
  herdId: string;
  day: number;
  paddockId: string;
  distanceKm: number;
  /** minutes per behaviour state */
  budget: Record<BehaviourState, number>;
  areaUsedHa: number;
  meanSpreadM: number;
  waterVisits: number;
};

export type Detection = {
  herdId: string;
  expected: number;
  detected: number;
  confidencePct: number;
  /** individuals the model flagged for a human look (lame, calving, isolated) */
  flagged: number;
};

export type Flight = {
  id: string;
  day: number;
  hour: number;
  status: 'complete' | 'partial' | 'aborted';
  durationMin: number;
  coverageHa: number;
  paddockIds: string[];
  images: number;
  batteryPct: number;
  windMs: number;
  tempC: number;
  detections: Detection[];
  note?: Bilingual;
};

export type PaddockDay = {
  paddockId: string;
  day: number;
  /** standing biomass, kg dry matter per hectare */
  biomass: number;
  ndvi: number;
  /** share of available forage removed in the current grazing cycle, 0–1 */
  utilization: number;
  restDays: number;
  stockingAuHa: number;
  grazedHours: number;
  healthIndex: number;
};

export type DayWeather = {
  day: number;
  date: string;
  rainMm: number;
  tempC: number;
  windMs: number;
};

export type AlertKind =
  | 'countMismatch'
  | 'fenceBreach'
  | 'overgrazing'
  | 'waterGap'
  | 'heatStress'
  | 'animalWelfare'
  | 'restViolation';

export type Severity = 'critical' | 'serious' | 'warning' | 'good';

export type Alert = {
  id: string;
  day: number;
  hour: number;
  kind: AlertKind;
  severity: Severity;
  title: Bilingual;
  detail: Bilingual;
  paddockId?: string;
  herdId?: string;
};

export type Dataset = {
  meta: {
    ranch: Bilingual;
    region: Bilingual;
    startDate: string;
    days: number;
    /** regulator-approved stocking quota for the whole ranch, in sheep units */
    quotaSheepUnits: number;
    origin: { lat: number; lon: number };
    metresPerDegLat: number;
    metresPerDegLon: number;
    width: number;
    height: number;
  };
  paddocks: Paddock[];
  water: WaterPoint[];
  landmarks: Landmark[];
  herds: Herd[];
  steps: HerdStep[];
  /** steps indexed by [day][hour] -> herd steps */
  stepIndex: HerdStep[][][];
  herdDays: HerdDay[];
  flights: Flight[];
  paddockDays: PaddockDay[];
  weather: DayWeather[];
  alerts: Alert[];
  grazingHeat: { cols: number; rows: number; cellM: number; values: number[] };
};
