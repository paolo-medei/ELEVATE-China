import { makeRng } from '../lib/rng';
import { dist, fromLatLon, pointInPolygon } from '../lib/geo';
import { cowRecord, cowTallyForDay } from './records';
import { elevationAt, herds, paddockById, RANCH_H, RANCH_W } from './ranch';
import { ATTENTION, LOST_ANIMALS, on, SEPARATED, WELFARE } from './incidents';
import type { Dataset, Pt } from './types';

/** One ear-tagged animal. IDs read "1-042": herd number, then the animal's number in it. */
export type Cow = {
  id: string;
  herdId: string;
  /** position in the whole roster, used to seed this animal's own scatter */
  idx: number;
  /** stable per-animal traits, so the same cows behave the same way all season */
  edginess: number;
  activity: number;
};

export const cows: Cow[] = herds.flatMap((herd, hi) => {
  const rng = makeRng(4100 + hi * 17);
  return Array.from({ length: herd.head }, (_, i) => ({
    id: `${hi + 1}-${String(i + 1).padStart(3, '0')}`,
    herdId: herd.id,
    idx: hi * 1000 + i,
    // a few animals genuinely prefer the edge of the mob; most stay in the middle
    edginess: 0.55 + rng.next() ** 2 * 1.5,
    activity: 0.78 + rng.next() * 0.45,
  }));
});

export const cowsByHerd = new Map(herds.map((h) => [h.id, cows.filter((c) => c.herdId === h.id)]));
export const cowById = new Map(cows.map((c) => [c.id, c]));

export type CowFlag = 'notFound' | 'isolated' | 'stationary' | 'sick' | 'separated';

export type CowState = {
  cow: Cow;
  at: Pt;
  /** metres from the centre of its own herd */
  fromHerdM: number;
  detected: boolean;
  /** false when no mission covered this herd today — absence proves nothing */
  surveyed: boolean;
  confidencePct: number;
  /** days since the drone last picked this animal out; 0 = seen today */
  lastSeenDaysAgo: number;
  distanceKm: number;
  /** hours spent lying or standing still */
  stillHours: number;
  flags: CowFlag[];
};

const hash = (herdId: string, day: number) => herdId.charCodeAt(1) * 7919 + day * 104729;

/**
 * Which animals the drone failed to pick out, derived from the herd count the mission
 * already reported — so the individual view can never disagree with the herd totals.
 */
function missedIds(data: Dataset, day: number, herdId: string): Set<string> {
  // where the workbook names the animals it did not see, that list is the answer
  const recorded = cowTallyForDay(day, herdId);
  if (recorded) return recorded.missing;

  const det = data.flights
    .filter((f) => f.day === day)
    .flatMap((f) => f.detections)
    .find((d) => d.herdId === herdId);
  const roster = cowsByHerd.get(herdId)!;
  if (!det) return new Set(roster.map((c) => c.id)); // no flight: nobody was seen
  const gap = det.expected - det.detected;
  if (gap <= 0) return new Set();

  const out = new Set<string>();
  // an animal the search has not found yet is missing whatever the rest of the count says
  for (const l of LOST_ANIMALS) {
    if (on(l, day) && roster.some((c) => c.id === l.cowId)) out.add(l.cowId);
  }

  // the rest is occlusion: mostly luck of the frame, nudged by how edgy the animal is
  const rng = makeRng(hash(herdId, day));
  const scored = roster
    .filter((c) => !out.has(c.id))
    .map((c) => ({ id: c.id, score: rng.next() - c.edginess * 0.12 }))
    .sort((a, b) => a.score - b.score);
  for (const s of scored) {
    if (out.size >= gap) break;
    out.add(s.id);
  }
  return out;
}

const missCache = new Map<string, Set<string>>();
const missed = (data: Dataset, day: number, herdId: string) => {
  const key = `${herdId}:${day}`;
  let v = missCache.get(key);
  if (!v) {
    v = missedIds(data, day, herdId);
    missCache.set(key, v);
  }
  return v;
};

/** Positions of every animal at one moment, with everything the map and the detail panel need. */
export function cowSnapshot(data: Dataset, day: number, hour: number): CowState[] {
  const out: CowState[] = [];

  for (const herd of herds) {
    const step = data.stepIndex[day][hour].find((s) => s.herdId === herd.id);
    if (!step) continue;
    const paddock = paddockById.get(step.paddockId)!;
    const herdDay = data.herdDays.find((hd) => hd.day === day && hd.herdId === herd.id);
    const det = data.flights
      .filter((f) => f.day === day)
      .flatMap((f) => f.detections)
      .find((d) => d.herdId === herd.id);
    const gone = missed(data, day, herd.id);

    const roster = cowsByHerd.get(herd.id)!;
    const flagged = new Set(
      WELFARE.filter((wf) => on(wf, day) && roster.some((c) => c.id === wf.cowId)).map(
        (wf) => wf.cowId,
      ),
    );

    for (const cow of roster) {
      const rng = makeRng(
        ((cow.idx * 2654435761) ^ (day * 40503) ^ (hour * 2246822519)) >>> 0,
      );
      rng.next();
      rng.next();
      rng.next();
      const angle = rng.next() * Math.PI * 2;
      const radius = step.spreadM * 0.5 * Math.sqrt(rng.next()) * cow.edginess;
      let at = { x: step.at.x + Math.cos(angle) * radius, y: step.at.y + Math.sin(angle) * radius };

      // keep animals behind the fence unless the whole herd has broken out
      if (!step.offPaddock) {
        let guard = 0;
        while (!pointInPolygon(at, paddock.polygon) && guard++ < 12) {
          at = {
            x: at.x + (paddock.centroid.x - at.x) * 0.25,
            y: at.y + (paddock.centroid.y - at.y) * 0.25,
          };
        }
      }

      const attention = ATTENTION.find((a) => a.cowId === cow.id && on(a, day));
      const separated = SEPARATED.find((a) => a.cowId === cow.id && on(a, day));
      const drift = attention ?? separated;
      if (drift) {
        // drift toward the middle of the plateau so the animal is always on the map
        const dx = RANCH_W / 2 - step.at.x;
        const dy = RANCH_H / 2 - step.at.y;
        const len = Math.hypot(dx, dy) || 1;
        at = {
          x: step.at.x + (dx / len) * drift.awayM - (dy / len) * drift.side,
          y: step.at.y + (dy / len) * drift.awayM + (dx / len) * drift.side,
        };
      }

      // a position typed into the Cow positions sheet is where the drone saw this animal
      const fix = cowRecord(day, hour, cow.id);
      if (fix) {
        at = fromLatLon(
          { lat: fix.lat, lon: fix.lon },
          data.meta.origin,
          data.meta.metresPerDegLat,
          data.meta.metresPerDegLon,
        );
      }

      const fromHerdM = dist(at, step.at);
      const surveyed = det !== undefined;
      const detected = fix ? fix.detected : surveyed && !gone.has(cow.id);

      let lastSeenDaysAgo = 0;
      if (!detected) {
        lastSeenDaysAgo = 1;
        while (lastSeenDaysAgo < 60 && day - lastSeenDaysAgo >= 0) {
          if (!missed(data, day - lastSeenDaysAgo, herd.id).has(cow.id)) break;
          lastSeenDaysAgo++;
        }
      }

      /*
       * Still time is measured against the herd's own day, not a fixed number of hours.
       * On a hot day the whole mob lies up for sixteen hours, and an absolute threshold
       * flagged half of them — which is a broken alarm, not a finding. What matters is
       * an animal that is far stiller than the herd it is standing in.
       */
      const herdStill = herdDay ? (herdDay.budget.resting + herdDay.budget.ruminating) / 60 : 0;
      const stillHours = attention
        ? herdStill + 6.5 + (cow.idx % 5) * 0.2
        : herdStill * (2 - cow.activity);

      const flags: CowFlag[] = [];
      if (surveyed && !detected) flags.push('notFound');
      if (attention) flags.push('isolated');
      else if (separated) flags.push('separated');
      /*
       * The margin sits above anything the natural spread of rest time can reach — the
       * quietest animal in a mob lies up about a fifth longer than the average, which on
       * a long day is four hours and is not a finding. Flagging the tail of a normal
       * distribution every hot afternoon is how an alarm gets ignored.
       */
      if (stillHours > herdStill + 5 && stillHours > 14) flags.push('stationary');
      if (flagged.has(cow.id)) flags.push('sick');

      out.push({
        cow,
        at,
        fromHerdM: Math.round(fromHerdM),
        detected,
        surveyed,
        confidencePct: fix
          ? fix.confidencePct
          : detected
            ? +Math.min(
                99.6,
                Math.max(
                  70,
                  (det?.confidencePct ?? 95) +
                    rng.gauss(0, 4.6) -
                    // animals bunched in the middle of the mob overlap each other in frame
                    (fromHerdM < step.spreadM * 0.35 ? 5.5 : 0) -
                    (stillHours > 14 ? 2 : 0),
                ),
              ).toFixed(1)
            : 0,
        lastSeenDaysAgo,
        distanceKm: +((herdDay?.distanceKm ?? 0) * cow.activity).toFixed(2),
        stillHours: +stillHours.toFixed(1),
        flags,
      });
    }
  }

  return out;
}

export const FLAG_SEVERITY: Record<CowFlag, 'critical' | 'serious' | 'warning'> = {
  notFound: 'serious',
  sick: 'serious',
  isolated: 'warning',
  stationary: 'warning',
  separated: 'warning',
};

/** Missing once is a shadow under a tree; missing for days is a lost animal. */
export function cowSeverity(state: CowState): 'critical' | 'serious' | 'warning' {
  // away from the herd and barely moving is the combination that kills animals
  if (state.flags.includes('isolated') && state.flags.includes('stationary')) return 'critical';
  if (!state.detected && state.lastSeenDaysAgo >= 3) return 'critical';
  if (state.flags.length === 0) return 'warning';
  return FLAG_SEVERITY[state.flags[0]];
}

export { elevationAt };
export { ATTENTION, SEPARATED, WELFARE } from './incidents';

/**
 * The two animals the demo is built around: they drift away from Herd 1 and stop moving,
 * which is exactly the pattern a grazier wants flagged before it becomes a dead animal.
 */
export type DayAttention = {
  day: number;
  /** null when no mission counted that day, so the chart shows a gap rather than a spike */
  missing: number | null;
  needCheck: number;
  isolated: number;
  stationary: number;
  sick: number;
};

let attentionCache: DayAttention[] | null = null;

/**
 * The same per-animal rules run across the whole season, so the history page counts the
 * very same animals the dashboard is flagging today.
 */
export function attentionByDay(data: Dataset): DayAttention[] {
  if (attentionCache) return attentionCache;
  attentionCache = Array.from({ length: data.meta.days }, (_, day) => {
    const states = cowSnapshot(data, day, 8);
    const has = (f: CowFlag) => states.filter((c) => c.flags.includes(f)).length;
    // only a finished round can say an animal was absent; a shortened one proves nothing
    const counted = data.flights.some(
      (f) => f.day === day && f.detections.length > 0 && f.status === 'complete',
    );
    return {
      day,
      missing: counted ? states.filter((c) => c.surveyed && !c.detected).length : null,
      needCheck: states.filter((c) => c.flags.some((f) => f !== 'notFound')).length,
      isolated: has('isolated'),
      stationary: has('stationary'),
      sick: has('sick'),
    };
  });
  return attentionCache;
}
