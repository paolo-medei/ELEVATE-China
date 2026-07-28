import { clamp, makeRng, type Rng } from '../lib/rng';
import { dist, pointInPolygon } from '../lib/geo';
import {
  ALLOWABLE_USE,
  elevationAt,
  INTAKE_KG_AU_DAY,
  landmarks,
  lostOn,
  M_PER_DEG_LAT,
  M_PER_DEG_LON,
  ORIGIN,
  paddockById,
  paddocks,
  QUOTA_SHEEP_UNITS,
  RANCH_H,
  RANCH_W,
  ROTATION,
  SEASON_DAYS,
  herds,
  water,
} from './ranch';
import { FARM } from './source';
import type {
  Alert,
  BehaviourState,
  DayWeather,
  Dataset,
  Detection,
  Flight,
  HerdDay,
  HerdStep,
  PaddockDay,
  Pt,
} from './types';

/** One warm-season grazing period, taken from the database (1 June – 28 September). */
export const DAYS = SEASON_DAYS;
export const START_DATE = new Date(`${FARM.season.startDate}T00:00:00Z`);

export const dateForDay = (day: number) => {
  const d = new Date(START_DATE.getTime() + day * 86_400_000);
  return d.toISOString().slice(0, 10);
};

const BEHAVIOURS: BehaviourState[] = ['grazing', 'ruminating', 'resting', 'travelling', 'watering'];

/** Diurnal template: probability weights per hour for each behaviour. */
const DIURNAL: Record<BehaviourState, number[]> = {
  //        0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19  20  21  22  23
  grazing: [
    0.05, 0.03, 0.03, 0.08, 0.35, 0.8, 0.9, 0.9, 0.85, 0.7, 0.5, 0.3, 0.15, 0.15, 0.3, 0.55, 0.8,
    0.9, 0.9, 0.8, 0.5, 0.25, 0.1, 0.06,
  ],
  ruminating: [
    0.45, 0.5, 0.5, 0.45, 0.3, 0.1, 0.05, 0.05, 0.08, 0.15, 0.25, 0.3, 0.35, 0.4, 0.4, 0.25, 0.1,
    0.05, 0.05, 0.1, 0.3, 0.45, 0.5, 0.5,
  ],
  resting: [
    0.48, 0.45, 0.45, 0.42, 0.2, 0.04, 0.02, 0.02, 0.03, 0.07, 0.12, 0.2, 0.3, 0.32, 0.22, 0.12,
    0.04, 0.02, 0.02, 0.05, 0.12, 0.25, 0.38, 0.42,
  ],
  travelling: [
    0.02, 0.02, 0.02, 0.05, 0.15, 0.06, 0.03, 0.03, 0.04, 0.06, 0.1, 0.14, 0.08, 0.06, 0.06, 0.07,
    0.06, 0.03, 0.03, 0.05, 0.08, 0.05, 0.02, 0.02,
  ],
  watering: [
    0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.02, 0.03, 0.06, 0.12, 0.07, 0.02, 0.01, 0.0, 0.0,
    0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
  ],
};

/** Scripted incidents — the events the demo is meant to surface. */
const BREACHES: { herdId: string; day: number; from: number; to: number; to_: Pt }[] = [
  { herdId: 'H3', day: 34, from: 2, to: 10, to_: { x: 9900, y: 1250 } },
  { herdId: 'H1', day: 71, from: 19, to: 23, to_: { x: 5200, y: 6300 } },
  { herdId: 'H4', day: 103, from: 4, to: 9, to_: { x: 480, y: 3400 } },
];

const randomPointInPolygon = (poly: Pt[], rng: Rng): Pt => {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  for (let i = 0; i < 200; i++) {
    const p = { x: rng.range(minX, maxX), y: rng.range(minY, maxY) };
    if (pointInPolygon(p, poly)) return p;
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
};

/** Walk from the centroid toward `target` and stop at the last point still inside. */
const reachableTowards = (centroid: Pt, target: Pt, poly: Pt[]): Pt => {
  let best = centroid;
  for (let t = 0.05; t <= 1; t += 0.05) {
    const p = { x: centroid.x + (target.x - centroid.x) * t, y: centroid.y + (target.y - centroid.y) * t };
    if (pointInPolygon(p, poly)) best = p;
  }
  return best;
};

/** Days when the fleet stays on the pad — one gale per month plus a foggy morning. */
const WINDY_DAYS = new Set([12, 41, 63, 88, 109]);
const GUSTY_DAYS = new Set([7, 29, 55, 74, 96, 113]);

export function buildWeather(rng: Rng): DayWeather[] {
  const out: DayWeather[] = [];
  for (let day = 0; day < DAYS; day++) {
    // Xilingol gets ~70% of its rain in the July–August monsoon peak
    const monsoon = day >= 30 && day <= 82;
    const wetDay = rng.bool(monsoon ? 0.34 : 0.13);
    const heavy = wetDay && rng.bool(monsoon ? 0.3 : 0.12);
    const rainMm = wetDay ? (heavy ? rng.range(9, 28) : rng.range(0.4, 6)) : 0;

    // seasonal temperature curve peaking in mid-July, with one heatwave
    const seasonal = day <= 45 ? 24 - 6 * ((45 - day) / 45) ** 2 : 24 - 12 * ((day - 45) / 75) ** 2;
    const heatwave = day >= 50 && day <= 57;
    const tempC = clamp(
      seasonal + (heatwave ? 8 : 0) + rng.gauss(0, 2.1) - (rainMm > 6 ? 4 : 0),
      2,
      39,
    );

    const windMs = WINDY_DAYS.has(day)
      ? rng.range(11.5, 14)
      : GUSTY_DAYS.has(day)
        ? rng.range(9.2, 10.8)
        : rng.range(1.5, 7.5) + (day > 95 ? 1.5 : 0);

    out.push({
      day,
      date: dateForDay(day),
      rainMm: +rainMm.toFixed(1),
      tempC: +tempC.toFixed(1),
      windMs: +windMs.toFixed(1),
    });
  }
  return out;
}

/** Which paddock each herd occupies on each day (simple deferred-rotation grazing plan). */
function buildRotation() {
  const schedule = new Map<string, string[]>();
  herds.forEach((h, i) => {
    const period = Math.max(1, ROTATION[i].daysPerArea);
    const offset = ROTATION[i].offset;
    const days: string[] = [];
    for (let day = 0; day < DAYS; day++) {
      const blockIndex = Math.floor((day + offset) / period);
      days.push(h.rotation[blockIndex % h.rotation.length]);
    }
    schedule.set(h.id, days);
  });
  return schedule;
}

function simulateHerds(rng: Rng, schedule: Map<string, string[]>, weather: DayWeather[]) {
  const steps: HerdStep[] = [];
  const herdDays: HerdDay[] = [];

  for (const herd of herds) {
    const days = schedule.get(herd.id)!;
    let pos: Pt = { ...paddockById.get(days[0])!.centroid };

    for (let day = 0; day < DAYS; day++) {
      const paddock = paddockById.get(days[day])!;
      const w = weather[day];
      const beddingSeed = makeRng(day * 97 + herd.id.charCodeAt(1) * 13 + paddock.id.length);
      const bedding = randomPointInPolygon(paddock.polygon, beddingSeed);
      const nearestWater = water.reduce((a, b) =>
        dist(b.at, paddock.centroid) < dist(a.at, paddock.centroid) ? b : a,
      );
      const waterTarget = pointInPolygon(nearestWater.at, paddock.polygon)
        ? nearestWater.at
        : reachableTowards(paddock.centroid, nearestWater.at, paddock.polygon);

      let patch = randomPointInPolygon(paddock.polygon, rng);
      const budget: Record<BehaviourState, number> = {
        grazing: 0,
        ruminating: 0,
        resting: 0,
        travelling: 0,
        watering: 0,
      };
      let distanceM = 0;
      let waterVisits = 0;
      let spreadSum = 0;
      const cells = new Set<string>();

      for (let hour = 0; hour < 24; hour++) {
        if (hour % 5 === 0) patch = randomPointInPolygon(paddock.polygon, rng);

        // heat shifts grazing out of the middle of the day and into the night
        const hot = w.tempC >= 32;
        const heatFactor = hot && hour >= 10 && hour <= 16 ? 0.4 : hot && (hour <= 5 || hour >= 20) ? 1.35 : 1;
        const wet = w.rainMm > 10 ? 0.75 : 1;

        // draw the hour's behaviour from the diurnal weights rather than taking the
        // mode, so a day adds up to a realistic time budget instead of one activity
        const weights = BEHAVIOURS.map((b) => {
          let w2 = DIURNAL[b][hour];
          if (b === 'grazing') w2 *= heatFactor * wet;
          if (b === 'resting' && hot && hour >= 11 && hour <= 15) w2 *= 1.6;
          if (b === 'watering') w2 *= hot ? 2.2 : 1;
          return Math.max(0, w2);
        });
        const totalW = weights.reduce((a, w2) => a + w2, 0) || 1;
        let roll = rng.next() * totalW;
        let best: BehaviourState = BEHAVIOURS[BEHAVIOURS.length - 1];
        for (let i = 0; i < BEHAVIOURS.length; i++) {
          roll -= weights[i];
          if (roll <= 0) {
            best = BEHAVIOURS[i];
            break;
          }
        }
        // cattle water at least once a day in summer; force the midday visit if the
        // draw has not produced one yet
        if (hour === 12 && budget.watering === 0) best = 'watering';

        const breach = BREACHES.find(
          (b) => b.herdId === herd.id && b.day === day && hour >= b.from && hour <= b.to,
        );

        let target: Pt;
        let stepLen: number;
        let spread: number;
        switch (best) {
          case 'grazing':
            target = patch;
            stepLen = rng.range(140, 320);
            spread = rng.range(260, 430);
            break;
          case 'travelling':
            target = rng.bool(0.5) ? patch : waterTarget;
            stepLen = rng.range(420, 780);
            spread = rng.range(110, 210);
            break;
          case 'watering':
            target = waterTarget;
            stepLen = rng.range(260, 520);
            spread = rng.range(70, 140);
            break;
          default:
            target = bedding;
            stepLen = rng.range(40, 130);
            spread = rng.range(90, 180);
        }
        if (breach) {
          target = breach.to_;
          stepLen = rng.range(500, 900);
          spread = rng.range(180, 320);
        }

        const dx = target.x - pos.x;
        const dy = target.y - pos.y;
        const d = Math.hypot(dx, dy) || 1;
        const move = Math.min(stepLen, d);
        let nx = pos.x + (dx / d) * move + rng.gauss(0, 55);
        let ny = pos.y + (dy / d) * move + rng.gauss(0, 55);

        if (!breach) {
          // keep the herd behind its fence line
          let guard = 0;
          while (!pointInPolygon({ x: nx, y: ny }, paddock.polygon) && guard++ < 24) {
            nx += (paddock.centroid.x - nx) * 0.18;
            ny += (paddock.centroid.y - ny) * 0.18;
          }
        }
        nx = clamp(nx, 40, RANCH_W - 40);
        ny = clamp(ny, 40, RANCH_H - 40);

        const stepDist = Math.hypot(nx - pos.x, ny - pos.y);
        distanceM += stepDist;
        pos = { x: nx, y: ny };
        const offPaddock = !pointInPolygon(pos, paddock.polygon);

        budget[best] += 60;
        if (best === 'watering') waterVisits++;
        spreadSum += spread;
        cells.add(`${Math.floor(pos.x / 200)}:${Math.floor(pos.y / 200)}`);

        steps.push({
          herdId: herd.id,
          t: day * 24 + hour,
          day,
          hour,
          at: pos,
          spreadM: Math.round(spread),
          state: best,
          paddockId: paddock.id,
          offPaddock,
        });
      }

      herdDays.push({
        herdId: herd.id,
        day,
        paddockId: paddock.id,
        distanceKm: +(distanceM / 1000).toFixed(2),
        budget,
        areaUsedHa: cells.size * 4,
        meanSpreadM: Math.round(spreadSum / 24),
        waterVisits,
      });
    }
  }
  return { steps, herdDays };
}

/** season offtake as a share of what the area can safely give up */
const utilizationOf = (offtake: number, p: { biomassCeiling: number }) =>
  clamp(offtake / (p.biomassCeiling * ALLOWABLE_USE), 0, 2);

function simulatePasture(rng: Rng, herdDays: HerdDay[], weather: DayWeather[]): PaddockDay[] {
  const out: PaddockDay[] = [];
  const state = new Map(
    paddocks.map((p) => [
      p.id,
      {
        // 1 June: the sward is just greening up after the spring rest period
        biomass: p.biomassCeiling * 0.2 * (0.9 + rng.next() * 0.2),
        seasonOfftake: 0,
        restDays: 20 + rng.int(0, 14),
      },
    ]),
  );

  for (let day = 0; day < DAYS; day++) {
    const rain7 = weather
      .slice(Math.max(0, day - 6), day + 1)
      .reduce((a, w) => a + w.rainMm, 0);
    const moisture = clamp(0.3 + rain7 / 30, 0.3, 1.35);
    // growth tails off from mid-August and the sward is dormant by late September
    const seasonGrowth = day < 70 ? 1 : Math.max(0, 1 - (day - 70) / 34);
    const senescence = day > 92 ? 0.006 : 0;

    for (const p of paddocks) {
      const s = state.get(p.id)!;
      const occupants = herdDays.filter((hd) => hd.day === day && hd.paddockId === p.id);
      const au = occupants.reduce((a, hd) => {
        const herd = herds.find((h) => h.id === hd.herdId)!;
        return a + herd.head * herd.auPerHead;
      }, 0);
      const grazedHours = occupants.reduce((a, hd) => a + hd.budget.grazing / 60, 0);

      const growth =
        0.17 *
        s.biomass *
        (1 - s.biomass / p.biomassCeiling) *
        moisture *
        seasonGrowth *
        (weather[day].tempC > 34 ? 0.7 : 1);
      const offtake = au > 0 ? (au * INTAKE_KG_AU_DAY) / p.areaHa : 0;

      if (au > 0) {
        s.restDays = 0;
        s.seasonOfftake += offtake;
      } else {
        s.restDays += 1;
      }
      s.biomass = clamp(s.biomass + growth - offtake - s.biomass * senescence, 40, p.biomassCeiling);

      // utilisation = season-to-date offtake against the forage that may safely be removed
      const utilization = utilizationOf(s.seasonOfftake, p);
      const relative = s.biomass / p.biomassCeiling;
      /*
       * Vegetation index is not just standing crop: an area 500 m higher greens up two
       * weeks later and browns off earlier, and a hard-grazed sward shows bare ground.
       * That is what gives each area its own curve through the season.
       */
      const lateness = (elevationAt(p.centroid) - 1980) / 260; // ~0 low, ~2 on the ridges
      const greenUp = clamp(0.42 + (day - 4 - lateness * 9) / 30, 0.42, 1);
      const fade = clamp(1 - (day - (86 - lateness * 8)) / 46, 0.52, 1);
      const bare = clamp(1 - utilizationOf(s.seasonOfftake, p) * 0.22, 0.7, 1);
      const ndvi = clamp(
        (0.1 + 0.68 * Math.pow(relative, 0.7)) * greenUp * fade * bare + rng.gauss(0, 0.006),
        0.05,
        0.92,
      );
      const restAdequacy = clamp(s.restDays / 30, 0, 1);
      const healthIndex = clamp(
        46 * clamp(relative / 0.75, 0, 1) +
          32 * (1 - clamp(utilization / 1.1, 0, 1)) +
          12 * restAdequacy +
          10 * clamp(ndvi / 0.65, 0, 1),
        0,
        100,
      );

      out.push({
        paddockId: p.id,
        day,
        biomass: Math.round(s.biomass),
        ndvi: +ndvi.toFixed(3),
        utilization: +utilization.toFixed(3),
        restDays: s.restDays,
        stockingAuHa: +(au / p.areaHa).toFixed(4),
        grazedHours: +grazedHours.toFixed(1),
        healthIndex: Math.round(healthIndex),
      });
    }
  }
  return out;
}

/**
 * Flight times come from the database. The first mission of the day is the muster count —
 * it flies the occupied areas and produces the head counts; later ones sweep the resting
 * ground, so adding an hour to `flights.hours` adds a pasture check, not a second count.
 */
const FLIGHT_SLOTS = FARM.flights.hours.map((hour, i) => ({
  hour,
  kind: (i === 0 ? 'muster' : 'pasture') as 'muster' | 'pasture',
}));

function simulateFlights(rng: Rng, herdDays: HerdDay[], weather: DayWeather[]): Flight[] {
  const flights: Flight[] = [];
  for (let day = 0; day < DAYS; day++) {
    const w = weather[day];
    const occupied = herdDays.filter((hd) => hd.day === day);

    for (const slot of FLIGHT_SLOTS) {
      const grounded = w.windMs > FARM.flights.groundedAboveWindMs;
      const partial = !grounded && w.windMs > FARM.flights.shortenedAboveWindMs;
      const status: Flight['status'] = grounded ? 'aborted' : partial ? 'partial' : 'complete';

      // muster flights fly the occupied paddocks; pasture flights sweep the resting ones
      const occupiedIds = [...new Set(occupied.map((hd) => hd.paddockId))];
      const restingIds = paddocks.map((p) => p.id).filter((id) => !occupiedIds.includes(id));
      let paddockIds =
        slot.kind === 'muster'
          ? occupiedIds
          : [...restingIds.slice(day % Math.max(1, restingIds.length)), ...restingIds].slice(0, 4);
      if (partial) paddockIds = paddockIds.slice(0, Math.max(1, paddockIds.length - 1));
      if (grounded) paddockIds = [];

      const coverageHa = paddockIds.reduce((a, id) => a + paddockById.get(id)!.areaHa, 0);
      const detections: Detection[] = [];

      if (!grounded && slot.kind === 'muster') {
        for (const hd of occupied) {
          if (!paddockIds.includes(hd.paddockId)) continue;
          const herd = herds.find((h) => h.id === hd.herdId)!;
          const expected = herd.head;
          // occlusion: tall grass, calves lying down, animals bunched under shade
          // a complete low-altitude pass over an open plateau finds nearly every animal;
          // what actually costs a count is a shortened mission or a herd on the move
          let missRate = FARM.flights.baseMissRate + (hd.meanSpreadM < 160 ? 0.0025 : 0);
          if (w.tempC > 32) missRate += 0.002;
          if (partial) missRate += 0.03;
          const breachDay = BREACHES.some((b) => b.herdId === herd.id && b.day === day);
          if (breachDay) missRate += 0.075;
          const detected = clamp(
            expected - Math.round(expected * missRate) - lostOn(herd.id, day).length,
            Math.round(expected * 0.82),
            expected,
          );
          detections.push({
            herdId: herd.id,
            expected,
            detected,
            confidencePct: +clamp(98.2 - missRate * 90 + rng.gauss(0, 0.5), 88, 99.4).toFixed(1),
            flagged: rng.bool(0.22) ? rng.int(1, 3) : 0,
          });
        }
      }

      flights.push({
        id: `F${String(day + 1).padStart(2, '0')}-${slot.hour}`,
        day,
        hour: slot.hour,
        status,
        durationMin: grounded ? 0 : Math.round(coverageHa / 38 + rng.range(6, 12)),
        coverageHa,
        paddockIds,
        images: grounded ? 0 : Math.round(coverageHa * 1.6 + rng.range(60, 220)),
        batteryPct: grounded ? 0 : Math.round(clamp(coverageHa / 22 + rng.range(18, 30), 15, 96)),
        windMs: w.windMs,
        tempC: w.tempC,
        detections,
        note: grounded
          ? {
              en: `Grounded — wind above ${FARM.flights.groundedAboveWindMs} m/s launch limit`,
              zh: `风速超过 ${FARM.flights.groundedAboveWindMs} m/s 起飞限值，任务取消`,
            }
          : partial
            ? { en: 'Shortened mission — gusty conditions', zh: '阵风影响，航线缩短' }
            : undefined,
      });
    }
  }
  return flights;
}

function buildAlerts(
  steps: HerdStep[],
  herdDays: HerdDay[],
  paddockDays: PaddockDay[],
  flights: Flight[],
  weather: DayWeather[],
): Alert[] {
  const alerts: Alert[] = [];
  const herdName = (id: string) => herds.find((h) => h.id === id)!.name;
  const paddockName = (id: string) => paddockById.get(id)!.name;
  let n = 0;
  const push = (a: Omit<Alert, 'id'>) => alerts.push({ ...a, id: `A${++n}` });

  // 1. count reconciliation against the registered herd book
  for (let day = 0; day < DAYS; day++) {
    const dayFlights = flights.filter((f) => f.day === day && f.detections.length > 0);
    if (!dayFlights.length) {
      push({
        day,
        hour: 6,
        kind: 'countMismatch',
        severity: 'warning',
        title: { en: 'No aerial count today', zh: '当日无航拍清点' },
        detail: {
          en: 'All missions were grounded, so the head count is carried over from the previous survey.',
          zh: '当日航班全部取消，牲畜数量沿用上一次航拍结果。',
        },
      });
      continue;
    }
    for (const f of dayFlights) {
      for (const d of f.detections) {
        const gap = d.expected - d.detected;
        // a couple of hidden animals per hundred is normal occlusion, not a missing beast
        const gapShare = gap / Math.max(1, d.expected);
        if (gapShare >= 0.03) {
          // a shortened mission misses animals by itself: that is a recount, not a search
          const shortMission = f.status !== 'complete';
          push({
            day,
            hour: f.hour,
            kind: 'countMismatch',
            severity: shortMission ? 'warning' : gapShare >= 0.06 ? 'critical' : 'serious',
            herdId: d.herdId,
            title: shortMission
              ? {
                  en: `Recount needed · ${herdName(d.herdId).en}`,
                  zh: `${herdName(d.herdId).zh} 需重新清点`,
                }
              : {
                  en: `${gap} head unaccounted · ${herdName(d.herdId).en}`,
                  zh: `${herdName(d.herdId).zh} 缺 ${gap} 头`,
                },
            detail: shortMission
              ? {
                  en: `Flight ${f.id} was cut short by wind and only saw ${d.detected} of ${d.expected}. Fly the count again before treating any animal as missing.`,
                  zh: `${f.id} 架次因大风缩短，仅识别 ${d.detected} 头（登记 ${d.expected} 头）。请重新航拍清点后再判定是否走失。`,
                }
              : {
                  en: `Flight ${f.id} detected ${d.detected} of ${d.expected} registered animals at ${d.confidencePct}% mean confidence.`,
                  zh: `${f.id} 架次识别 ${d.detected} 头，登记 ${d.expected} 头，平均置信度 ${d.confidencePct}%。`,
                },
          });
        }
        if (d.flagged > 0) {
          push({
            day,
            hour: f.hour,
            kind: 'animalWelfare',
            severity: 'serious',
            herdId: d.herdId,
            title: {
              en: `${d.flagged} animal(s) flagged for inspection`,
              zh: `${d.flagged} 头牛需人工复核`,
            },
            detail: {
              en: 'Gait, isolation or lying-time anomaly detected in the imagery — check on the next round.',
              zh: '影像识别出步态异常、离群或卧倒时间异常，建议巡查时复核。',
            },
          });
        }
      }
    }
  }

  // 2. fence breaches, from the tracks themselves
  const seenBreach = new Set<string>();
  for (const s of steps) {
    if (!s.offPaddock) continue;
    const key = `${s.herdId}:${s.day}`;
    if (seenBreach.has(key)) continue;
    seenBreach.add(key);
    push({
      day: s.day,
      hour: s.hour,
      kind: 'fenceBreach',
      severity: 'critical',
      herdId: s.herdId,
      paddockId: s.paddockId,
      title: {
        en: `${herdName(s.herdId).en} outside ${paddockName(s.paddockId).en}`,
        zh: `${herdName(s.herdId).zh} 越出${paddockName(s.paddockId).zh}围栏`,
      },
      detail: {
        en: 'Herd centroid tracked beyond the assigned paddock boundary — likely open gate or downed fence.',
        zh: '牛群中心位置越出划定草场边界，疑似围栏破损或牧门未关。',
      },
    });
  }

  // 3. pasture pressure
  for (const pd of paddockDays) {
    const prev = paddockDays.find((x) => x.paddockId === pd.paddockId && x.day === pd.day - 1);
    if (!prev) continue;
    const p = paddockById.get(pd.paddockId)!;
    for (const level of [0.85, 1.0] as const) {
      if (pd.utilization > level && prev.utilization <= level) {
        push({
          day: pd.day,
          hour: 12,
          kind: 'overgrazing',
          severity: level >= 1 ? 'serious' : 'warning',
          paddockId: pd.paddockId,
          title:
            level >= 1
              ? {
                  en: `${paddockName(pd.paddockId).en} has used its full forage allowance`,
                  zh: `${paddockName(pd.paddockId).zh} 已用完全年可食牧草额度`,
                }
              : {
                  en: `${paddockName(pd.paddockId).en} past 85% of its forage allowance`,
                  zh: `${paddockName(pd.paddockId).zh} 已用去 85% 的可食牧草额度`,
                },
          detail: {
            en: `Season offtake is ${(pd.utilization * 100).toFixed(0)}% of the ${Math.round(p.biomassCeiling * ALLOWABLE_USE)} kg DM/ha that can be removed safely. Plan the next move off this paddock.`,
            zh: `牧季累计采食量已达可安全利用量（${Math.round(p.biomassCeiling * ALLOWABLE_USE)} kg/ha）的 ${(pd.utilization * 100).toFixed(0)}%，请安排转场。`,
          },
        });
      }
    }
    if (pd.biomass < p.biomassCeiling * 0.32 && prev.biomass >= p.biomassCeiling * 0.32) {
      push({
        day: pd.day,
        hour: 12,
        kind: 'overgrazing',
        severity: 'critical',
        paddockId: pd.paddockId,
        title: {
          en: `${paddockName(pd.paddockId).en} below residual target`,
          zh: `${paddockName(pd.paddockId).zh} 低于留茬底线`,
        },
        detail: {
          en: `Standing biomass ${pd.biomass} kg DM/ha is under the ${Math.round(p.biomassCeiling * 0.32)} kg residual that keeps the sward recovering.`,
          zh: `现存生物量 ${pd.biomass} kg/ha，低于维持草群恢复所需的 ${Math.round(p.biomassCeiling * 0.32)} kg/ha 留茬量。`,
        },
      });
    }
    if (pd.restDays > 0 && prev.restDays === 0 && prev.utilization > 0.55) {
      // paddock just came off grazing hot — track whether it gets its rest
      const regrazeDay = paddockDays.find(
        (x) => x.paddockId === pd.paddockId && x.day > pd.day && x.stockingAuHa > 0,
      );
      if (regrazeDay && regrazeDay.day - pd.day < 25) {
        push({
          day: regrazeDay.day,
          hour: 8,
          kind: 'restViolation',
          severity: 'warning',
          paddockId: pd.paddockId,
          title: {
            en: `${paddockName(pd.paddockId).en} re-grazed after ${regrazeDay.day - pd.day} days`,
            zh: `${paddockName(pd.paddockId).zh} 休牧 ${regrazeDay.day - pd.day} 天后再次放牧`,
          },
          detail: {
            en: 'Summer regrowth needs about 25 rest days at this rainfall. Consider extending the rotation.',
            zh: '按当前降水，夏季再生约需 25 天休牧期，建议延长轮牧周期。',
          },
        });
      }
    }
  }

  // 4. welfare / behaviour signals from the tracks
  for (const hd of herdDays) {
    const w = weather[hd.day];
    if (hd.waterVisits === 0) {
      push({
        day: hd.day,
        hour: 14,
        kind: 'waterGap',
        severity: 'serious',
        herdId: hd.herdId,
        paddockId: hd.paddockId,
        title: {
          en: `No watering visit · ${herdName(hd.herdId).en}`,
          zh: `${herdName(hd.herdId).zh} 全天未见饮水`,
        },
        detail: {
          en: 'No approach to a water point was tracked in 24 h — check trough level and pump.',
          zh: '24 小时内未监测到接近水点，请检查水槽水位与水泵。',
        },
      });
    }
    if (w.tempC >= 33 && hd.budget.grazing / 60 < 7.5) {
      push({
        day: hd.day,
        hour: 13,
        kind: 'heatStress',
        severity: 'warning',
        herdId: hd.herdId,
        paddockId: hd.paddockId,
        title: {
          en: `Heat-suppressed grazing · ${herdName(hd.herdId).en}`,
          zh: `${herdName(hd.herdId).zh} 高温采食受抑`,
        },
        detail: {
          en: `${(hd.budget.grazing / 60).toFixed(1)} h grazing at ${w.tempC.toFixed(0)}°C, against a 9–10 h norm. Expect a dip in daily gain.`,
          zh: `气温 ${w.tempC.toFixed(0)}°C，采食 ${(hd.budget.grazing / 60).toFixed(1)} 小时（常规 9–10 小时），日增重可能下降。`,
        },
      });
    }
  }

  return alerts.sort((a, b) => b.day - a.day || b.hour - a.hour);
}

export function buildHeatmap(steps: HerdStep[], cellM = 200) {
  const cols = Math.ceil(RANCH_W / cellM);
  const rows = Math.ceil(RANCH_H / cellM);
  const values = new Array(cols * rows).fill(0);
  for (const s of steps) {
    const weight = s.state === 'grazing' ? 1 : s.state === 'travelling' ? 0.35 : 0.2;
    const head = herds.find((h) => h.id === s.herdId)!.head;
    const cx = s.at.x / cellM;
    const cy = s.at.y / cellM;
    const radius = Math.max(1, Math.round(s.spreadM / cellM));
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const c = Math.floor(cx) + dx;
        const r = Math.floor(cy) + dy;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const falloff = Math.exp(-(dx * dx + dy * dy) / (2 * Math.max(1, radius) ** 2));
        values[r * cols + c] += weight * head * falloff;
      }
    }
  }
  const max = Math.max(...values, 1);
  return { cols, rows, cellM, values: values.map((v) => v / max) };
}

export function buildDataset(): Dataset {
  const rng = makeRng(880517);
  // the weather series is read straight from the database: edit a windy day there and the
  // flight for that day is grounded, the count is carried over, and the alert follows
  const weather: DayWeather[] = FARM.weather.slice(0, DAYS);
  const schedule = buildRotation();
  const { steps, herdDays } = simulateHerds(rng, schedule, weather);
  const paddockDays = simulatePasture(rng, herdDays, weather);
  const flights = simulateFlights(rng, herdDays, weather);
  const alerts = buildAlerts(steps, herdDays, paddockDays, flights, weather);

  const stepIndex: HerdStep[][][] = Array.from({ length: DAYS }, () =>
    Array.from({ length: 24 }, () => [] as HerdStep[]),
  );
  for (const s of steps) stepIndex[s.day][s.hour].push(s);

  return {
    meta: {
      ranch: FARM.meta.farm,
      region: FARM.meta.region,
      startDate: dateForDay(0),
      days: DAYS,
      quotaSheepUnits: QUOTA_SHEEP_UNITS,
      origin: ORIGIN,
      metresPerDegLat: M_PER_DEG_LAT,
      metresPerDegLon: M_PER_DEG_LON,
      width: RANCH_W,
      height: RANCH_H,
    },
    paddocks,
    water,
    landmarks,
    herds,
    steps,
    stepIndex,
    herdDays,
    flights,
    paddockDays,
    weather,
    alerts,
    grazingHeat: buildHeatmap(steps),
  };
}
