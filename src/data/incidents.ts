import { makeRng } from '../lib/rng';
import { herds, SEASON_DAYS } from './ranch';
import { FARM } from './source';

/**
 * Who the system flags, on which days, and for how long.
 *
 * An incident has an end as well as a beginning. A cow that drifts off and stops moving
 * is found on the next round; a lame animal is treated; a count that comes up short is
 * settled by the next morning's flight or by someone riding the fence line. Flagging the
 * same animals every day from here to the end of the season is what a broken system looks
 * like — and reporting one as unseen for twenty-five days is not a monitoring system at
 * all, it is a farm that has given up.
 *
 * So incidents open day by day at rates taken from the database, run for a few days, and
 * close. The whole season is drawn once from a fixed seed, so any given day always tells
 * the same story.
 */

export type Incident = {
  cowId: string;
  fromDay: number;
  /** how many days it runs, counting the first */
  days: number;
  /** metres from the mob while it lasts */
  awayM: number;
  side: number;
};

export type LostIncident = { cowId: string; herdId: string; fromDay: number; days: number };

/** whether an incident covers a given day */
export const on = (e: { fromDay: number; days?: number }, day: number) =>
  day >= e.fromDay && day < e.fromDay + (e.days ?? Infinity);

/** ear tags, built the same way the roster is, without needing the roster */
const tags = herds.flatMap((herd, hi) =>
  Array.from({ length: herd.head }, (_, i) => ({
    id: `${hi + 1}-${String(i + 1).padStart(3, '0')}`,
    herdId: herd.id,
  })),
);

const rates = FARM.animalEvents.perDay;

function roll() {
  const rng = makeRng(FARM.animalEvents.seed);
  const attention: Incident[] = [];
  const separated: Incident[] = [];
  const welfare: Incident[] = [];
  const lost: LostIncident[] = [];
  const busy = new Set<string>();

  const pick = () => {
    for (let tries = 0; tries < 12; tries++) {
      const tag = tags[rng.int(0, tags.length - 1)];
      if (!busy.has(tag.id)) return tag;
    }
    return null;
  };

  for (let day = 0; day < SEASON_DAYS; day++) {
    // an animal whose incident has closed is available again
    for (const e of [...attention, ...separated, ...welfare]) {
      if (day === e.fromDay + e.days) busy.delete(e.cowId);
    }
    for (const e of lost) if (day === e.fromDay + e.days) busy.delete(e.cowId);

    const open = (into: Incident[], minDays: number, maxDays: number, away: [number, number]) => {
      const tag = pick();
      if (!tag) return;
      busy.add(tag.id);
      into.push({
        cowId: tag.id,
        fromDay: day,
        days: rng.int(minDays, maxDays),
        awayM: Math.round(rng.range(away[0], away[1])),
        side: Math.round(rng.gauss(0, 260)),
      });
    };

    if (rng.next() < rates.needsAttention) open(attention, 1, 3, [900, 1400]);
    if (rng.next() < rates.separated) open(separated, 1, 2, [600, 900]);
    if (rng.next() < rates.welfare) open(welfare, 2, 4, [0, 0]);
    // a count short two mornings running is rare, and someone rides out the same week
    if (rng.next() < rates.lost) {
      const tag = pick();
      if (tag) {
        busy.add(tag.id);
        lost.push({ cowId: tag.id, herdId: tag.herdId, fromDay: day, days: rng.int(2, 3) });
      }
    }
  }
  return { attention, separated, welfare, lost };
}

const rolled = roll();
const scripted = FARM.animalEvents;

/** Hand-written incidents from the database come first, then the drawn ones. */
export const ATTENTION: Incident[] = [...scripted.needsAttention, ...rolled.attention];
export const SEPARATED: Incident[] = [...scripted.separated, ...rolled.separated];
export const WELFARE: { cowId: string; fromDay: number; days: number }[] = [
  ...scripted.welfare,
  ...rolled.welfare,
];

/**
 * Animals the morning count could not find. The flight count subtracts them and the
 * per-animal view marks them, so both tell the same story.
 */
export const LOST_ANIMALS: LostIncident[] = [...scripted.lost, ...rolled.lost];

export const lostOn = (herdId: string, day: number) =>
  LOST_ANIMALS.filter((l) => l.herdId === herdId && on(l, day));
