import { cowSeverity, type CowState } from '../data/animals';
import { paddockById } from '../data/ranch';
import { FARM } from '../data/source';
import { formatLatLon, pointInPolygon, toLatLon } from './geo';
import { paddockState } from './status';
import type { Bilingual, Dataset, Severity } from '../data/types';

export type IssueKind = 'missing' | 'attention' | 'separated' | 'sick' | 'grass' | 'flight';

export type Issue = {
  id: string;
  kind: IssueKind;
  severity: Severity;
  /** the headline a farmer reads first */
  title: Bilingual;
  /** what the drone actually saw */
  what: Bilingual;
  /** why it is worth their time */
  why: Bilingual;
  /** the one-line job for the dashboard */
  task: Bilingual;
  /** the full instruction for the alerts page */
  action: Bilingual;
  gps?: string;
  herdId?: string;
  cowIds?: string[];
  areaId?: string;
};

const RANK: Record<Severity, number> = { critical: 0, serious: 1, warning: 2, good: 3 };

/**
 * The single source of truth for "what is wrong today". The dashboard shows the top of
 * this list, the alerts page shows all of it, and both read the same objects — so the
 * two pages can never tell the farmer different stories.
 */
export function buildIssues(data: Dataset, day: number, cows: CowState[]): Issue[] {
  const out: Issue[] = [];
  const areaOf = (c: CowState) => data.paddocks.find((p) => pointInPolygon(c.at, p.polygon));
  const gpsOf = (p: { x: number; y: number }) =>
    formatLatLon(toLatLon(p, data.meta.origin, data.meta.metresPerDegLat, data.meta.metresPerDegLon));

  const flightsToday = data.flights.filter((f) => f.day === day);
  const flightFinished = flightsToday.some((f) => f.detections.length > 0 && f.status === 'complete');

  /*
   * 1 — animals to go and look at.
   *
   * Two different findings send a stockman on exactly the same errand: an animal away
   * from the herd and not moving, and one the imagery flagged for how it walks. Splitting
   * them produced two jobs a line apart that read "Check 2 cows in Herd 1 — Area 1" and
   * "Check 1 cow in Herd 1 — Area 1", which is nonsense on a to-do list. They are one
   * job: ride out and look these animals over. The card still explains both findings.
   */
  for (const herd of data.herds) {
    const inHerd = cows.filter((c) => c.cow.herdId === herd.id);
    const down = inHerd.filter((c) => c.flags.includes('isolated') && c.flags.includes('stationary'));
    const lame = inHerd.filter((c) => c.flags.includes('sick') && !down.includes(c));
    const check = [...down, ...lame];
    if (!check.length) continue;

    const worst = check[0];
    const area = areaOf(worst);
    const n = check.length;
    const list = (cs: typeof check, sep = ' and ') => cs.map((c) => c.cow.id).join(sep);
    const meanAway = down.length
      ? Math.round(down.reduce((a, c) => a + c.fromHerdM, 0) / down.length)
      : 0;
    const meanStill = down.length
      ? Math.round(down.reduce((a, c) => a + c.stillHours, 0) / down.length)
      : 0;

    const downSaw = {
      en: `${list(down)} ${down.length === 1 ? 'is' : 'are'} ${meanAway} m from the rest of the herd and ${down.length === 1 ? 'has' : 'have'} barely moved for ${meanStill} hours.`,
      zh: `${list(down, '、')} 距离牛群约 ${meanAway} 米，且已静止约 ${meanStill} 小时。`,
    };
    const lameSaw = {
      en: `The imagery flagged ${list(lame, ', ')} for an unusual gait or lying pattern.`,
      zh: `影像识别标记了 ${list(lame, '、')}，其步态或卧地姿态异常。`,
    };

    out.push({
      id: `attention-${herd.id}`,
      kind: 'attention',
      // an animal down and still is today's job; a limp can wait for the next muster
      severity: down.length ? 'critical' : 'serious',
      herdId: herd.id,
      cowIds: check.map((c) => c.cow.id),
      gps: gpsOf(worst.at),
      title: {
        en:
          n === 1
            ? `1 animal in ${herd.name.en} needs checking`
            : `${n} animals in ${herd.name.en} need checking`,
        zh: `${herd.name.zh} 有 ${n} 头牛需查看`,
      },
      what: {
        en: [down.length ? downSaw.en : '', lame.length ? lameSaw.en : ''].filter(Boolean).join(' '),
        zh: [down.length ? downSaw.zh : '', lame.length ? lameSaw.zh : ''].filter(Boolean).join(''),
      },
      why: down.length
        ? {
            en: 'Healthy cattle stay with the group and keep grazing. Leaving the herd and lying still is the first sign of injury, calving trouble or illness — and a lone animal is the one wolves take.',
            zh: '健康的牛会跟群并持续采食。离群且长时间卧地，往往是外伤、难产或疾病的最早信号，落单的牛也最易遭狼害。',
          }
        : {
            en: 'Lameness and early illness show up in how an animal walks days before it stops eating. Caught now, most cases are a simple treatment.',
            zh: '跛行与早期疾病会在停食前数日先反映在步态上。及早发现，多数只需简单处置。',
          },
      task: {
        en: `Check ${n} ${n === 1 ? 'cow' : 'cows'} in ${herd.name.en}${area ? ` — ${area.name.en}` : ''}`,
        zh: `查看${herd.name.zh}的 ${n} 头牛${area ? `（${area.name.zh}）` : ''}`,
      },
      action: down.length
        ? {
            en: `Ride out to the coordinates below today and look the animals over${lame.length ? `, including ${list(lame, ', ')} for lameness` : ''}. Bring them back to the herd or down to the camp if they cannot walk well.`,
            zh: `今日按下方坐标前往查看${lame.length ? `，并留意 ${list(lame, '、')} 是否跛行` : ''}。若行走困难，请将其带回牛群或牧点。`,
          }
        : {
            en: 'Look these animals over at the next muster; check their feet and udder.',
            zh: '下次集群时逐头检查，重点查蹄部与乳房。',
          },
    });
  }

  /*
   * 2 — animals the drone could not find.
   *
   * An animal missing for days is a search, and it gets a job of its own per herd. A herd
   * that came up one or two short this morning is not: that is ordinary occlusion, and
   * three separate amber lines saying "recount Herd 1", "recount Herd 2", "recount Herd 4"
   * is three ways of writing the same instruction. They become one.
   */
  const shortToday: { herd: (typeof data.herds)[number]; missing: CowState[] }[] = [];

  for (const herd of data.herds) {
    const missing = cows.filter((c) => c.cow.herdId === herd.id && c.surveyed && !c.detected);
    if (!missing.length) continue;
    // one missed count is shade or cover; two mornings running is worth the ride out
    const longGone = missing.filter((c) => c.lastSeenDaysAgo >= 2);
    if (!longGone.length) {
      shortToday.push({ herd, missing });
      continue;
    }
    const area = areaOf(missing[0]);
    const days = Math.max(...longGone.map((c) => c.lastSeenDaysAgo));
    const ids = longGone.map((c) => c.cow.id);
    out.push({
      id: `missing-${herd.id}`,
      kind: 'missing',
      severity: 'critical',
      herdId: herd.id,
      cowIds: ids,
      gps: gpsOf(longGone[0].at),
      title: {
        en: `${ids.length} missing from ${herd.name.en}`,
        zh: `${herd.name.zh} 走失 ${ids.length} 头`,
      },
      what: flightFinished
        ? {
            en: `This morning's count found ${herd.head - missing.length} of ${herd.head}. ${ids.join(', ')} ${
              ids.length === 1 ? 'was' : 'were'
            } not in ${days === 2 ? 'the last two counts' : `the last ${days} counts`} either.`,
            zh: `今晨清点 ${herd.head - missing.length}/${herd.head} 头。${ids.join('、')} 已连续 ${days} 次清点未入画。`,
          }
        : {
            // a shortened flight misses animals by itself, so the raw gap says nothing
            en: `This morning's flight was cut short by wind, so the count is incomplete. ${ids.join(', ')} also missed the ${days - 1 === 1 ? 'count before' : `${days - 1} counts before`}.`,
            zh: `今晨航拍因大风缩短，清点不完整。${ids.join('、')} 在此前 ${days - 1} 次清点中同样未出现。`,
          },
      why: {
        en: 'One missed count is usually an animal in shade or under cover. Two mornings running is worth a look — most turn up in a gully or through a gap in the fence.',
        zh: '单次未识别多为遮挡所致；连续两个清晨未出现则值得实地查看，多数会在沟谷或围栏缺口附近找到。',
      },
      task: {
        en: `Find ${ids.length} missing ${ids.length === 1 ? 'cow' : 'cows'} in ${herd.name.en}${
          area ? ` — ${area.name.en}` : ''
        }`,
        zh: `寻找${herd.name.zh}走失的 ${ids.length} 头牛${area ? `（${area.name.zh}）` : ''}`,
      },
      action: {
        en: `Have a look along the gullies and the fence line near the coordinates below for ${ids.join(', ')} on your next round.`,
        zh: `下次巡场时，请在下方坐标附近的沟谷与围栏一带查看 ${ids.join('、')}。`,
      },
    });
  }

  if (shortToday.length) {
    const names = shortToday.map((s) => s.herd.name.en).join(', ');
    const namesZh = shortToday.map((s) => s.herd.name.zh).join('、');
    const total = shortToday.reduce((a, s) => a + s.missing.length, 0);
    out.push({
      id: 'recount',
      kind: 'missing',
      severity: flightFinished ? 'warning' : 'serious',
      herdId: shortToday.length === 1 ? shortToday[0].herd.id : undefined,
      cowIds: shortToday.flatMap((s) => s.missing.map((c) => c.cow.id)),
      gps: gpsOf(shortToday[0].missing[0].at),
      title: !flightFinished
        ? {
            en: `This morning's count was cut short — ${names}`,
            zh: `今晨清点因大风中断 —— ${namesZh}`,
          }
        : {
            en:
              shortToday.length === 1
                ? `${total} not in frame in ${shortToday[0].herd.name.en}`
                : `${total} not in frame across ${shortToday.length} herds`,
            zh:
              shortToday.length === 1
                ? `${shortToday[0].herd.name.zh} 有 ${total} 头未入画`
                : `${shortToday.length} 个牛群共 ${total} 头未入画`,
          },
      what: flightFinished
        ? {
            en: `${names} each came up short by one or two this morning: ${shortToday
              .map((s) => `${s.herd.name.en} ${s.herd.head - s.missing.length}/${s.herd.head}`)
              .join(', ')}. All of the animals were seen on an earlier flight this week.`,
            zh: `今晨 ${namesZh} 各短少一两头：${shortToday
              .map((s) => `${s.herd.name.zh} ${s.herd.head - s.missing.length}/${s.herd.head}`)
              .join('、')}。相关牛只本周早些时候均被拍到。`,
          }
        : {
            en: `The flight was cut short by wind, so this morning's count is incomplete: ${names} were only partly in frame.`,
            zh: `本次航拍因大风缩短，今晨清点不完整：${namesZh} 仅部分入画。`,
          },
      why: flightFinished
        ? {
            en: 'One missed count is usually an animal in shade or under cover. It matters only if the same animal is missing again tomorrow.',
            zh: '单次未识别多为遮挡所致。若次日同一头牛仍未出现，才需重视。',
          }
        : {
            en: 'A shortened round misses animals by itself, so this gap is about the wind, not the cattle. Nobody needs to go looking on the strength of it.',
            zh: '缩短的航线本身就会漏拍，此处的差额源于大风而非牛群，不必据此派人搜寻。',
          },
      task: {
        en:
          shortToday.length === 1
            ? `Recount ${shortToday[0].herd.name.en} on tomorrow's flight`
            : `Recount ${shortToday.length} herds on tomorrow's flight`,
        zh:
          shortToday.length === 1
            ? `次日航拍时复点${shortToday[0].herd.name.zh}`
            : `次日航拍时复点 ${shortToday.length} 个牛群`,
      },
      action: {
        en: `Check tomorrow morning's count for ${names}. If the same animals are missing again, ride the fence line near the coordinates below.`,
        zh: `请核对 ${namesZh} 次日清晨的清点结果。若同一批牛仍未出现，请沿下方坐标附近的围栏巡查。`,
      },
    });
  }

  /*
   * 3 — animals that have drifted off the mob but are grazing normally.
   *
   * Pushing strays back is one round, not one round per herd, so however many herds have
   * lost a couple this is a single line on the list. The card names each animal and where.
   */
  const drifted = cows.filter((c) => c.flags.includes('separated'));
  if (drifted.length) {
    const byHerd = data.herds
      .map((herd) => ({ herd, cs: drifted.filter((c) => c.cow.herdId === herd.id) }))
      .filter((g) => g.cs.length);
    const where = byHerd
      .map((g) => {
        const area = areaOf(g.cs[0]);
        return `${g.cs.map((c) => c.cow.id).join(', ')} from ${g.herd.name.en}${area ? ` in ${area.name.en}` : ''}`;
      })
      .join('; ');
    const whereZh = byHerd
      .map((g) => {
        const area = areaOf(g.cs[0]);
        return `${g.herd.name.zh}的 ${g.cs.map((c) => c.cow.id).join('、')}${area ? `（${area.name.zh}）` : ''}`;
      })
      .join('；');
    const n = drifted.length;
    const area = areaOf(drifted[0]);
    out.push({
      id: 'separated',
      kind: 'separated',
      severity: 'warning',
      herdId: byHerd.length === 1 ? byHerd[0].herd.id : undefined,
      cowIds: drifted.map((c) => c.cow.id),
      gps: gpsOf(drifted[0].at),
      title: {
        en: n === 1 ? '1 animal has drifted from its herd' : `${n} animals have drifted from their herds`,
        zh: `${n} 头牛暂时离群`,
      },
      what: {
        en: `${where} — ${
          n === 1 ? 'it is' : 'they are'
        } ${Math.round(drifted.reduce((a, c) => a + c.fromHerdM, 0) / n)} m from the mob, but still grazing and moving normally.`,
        zh: `${whereZh} —— 距牛群约 ${Math.round(
          drifted.reduce((a, c) => a + c.fromHerdM, 0) / n,
        )} 米，但采食与活动均正常。`,
      },
      why: {
        en: 'Animals split off for good reasons — better feed, shade, a calf. It only becomes a problem if they stay out overnight, when they are easy prey and easy to miss at the next count.',
        zh: '牛只离群多因觅食、遮阴或带犊，属正常现象。但若过夜仍未归群，则易遭捕食，也易在下次清点时被遗漏。',
      },
      task:
        byHerd.length === 1
          ? {
              en: `Bring ${n} ${n === 1 ? 'cow' : 'cows'} back to ${byHerd[0].herd.name.en}${
                area ? ` — ${area.name.en}` : ''
              }`,
              zh: `将 ${n} 头牛赶回${byHerd[0].herd.name.zh}${area ? `（${area.name.zh}）` : ''}`,
            }
          : {
              en: `Bring ${n} cows back to their herds — ${byHerd
                .map((g) => areaOf(g.cs[0])?.name.en ?? g.herd.name.en)
                .join(', ')}`,
              zh: `将 ${n} 头牛赶回各自牛群（${byHerd
                .map((g) => areaOf(g.cs[0])?.name.zh ?? g.herd.name.zh)
                .join('、')}）`,
            },
      action: {
        en: 'Push them back to the mob on your next round. No hurry unless they are still out tomorrow.',
        zh: '下次巡场时将其赶回牛群。若次日仍未归群再行处理。',
      },
    });
  }

  /* 4 — areas that have run out of grass */
  const spent = data.paddockDays.filter((pd) => pd.day === day && paddockState(pd) === 'outOfGrass');
  for (const pd of spent) {
    const area = paddockById.get(pd.paddockId)!;
    const grazedBy = data.herdDays.find((hd) => hd.day === day && hd.paddockId === pd.paddockId);
    const herd = grazedBy ? data.herds.find((h) => h.id === grazedBy.herdId) : undefined;
    out.push({
      id: `grass-${area.id}`,
      kind: 'grass',
      severity: herd ? 'serious' : 'warning',
      areaId: area.id,
      herdId: herd?.id,
      gps: gpsOf(area.centroid),
      title: {
        en: `${area.name.en} has run out of grass`,
        zh: `${area.name.zh} 牧草已用尽`,
      },
      what: {
        en: `${Math.round(pd.utilization * 100)}% of the grass this area can spare in a season has been eaten, and ${pd.biomass} kg/ha is left standing.`,
        zh: `该草场本季可采食牧草已用去 ${Math.round(pd.utilization * 100)}%，现存 ${pd.biomass} kg/ha。`,
      },
      why: {
        en: 'Grazed past this point the plants cannot rebuild their roots before winter, and the area comes back thinner every year.',
        zh: '超过此界限后，牧草入冬前无法恢复根系，草场逐年退化。',
      },
      task: herd
        ? { en: `Move ${herd.name.en} off ${area.name.en}`, zh: `将${herd.name.zh}转出${area.name.zh}` }
        : { en: `Keep stock off ${area.name.en}`, zh: `${area.name.zh}暂停放牧` },
      action: herd
        ? {
            en: `Move ${herd.name.en} to a rested area and leave this one alone until next season.`,
            zh: `请将${herd.name.zh}转至休牧草场，该草场本季不再放牧。`,
          }
        : {
            en: 'Keep stock off this area for the rest of the season.',
            zh: '本季剩余时间请勿在此放牧。',
          },
    });
  }

  /*
   * 5 — the flight itself. Grounded and shortened are different mornings and the card has
   * to say which: quoting the launch limit on a day the drone actually flew, at a wind
   * speed below that limit, is simply untrue.
   */
  if (!flightFinished && flightsToday.length) {
    const wind = Math.max(...flightsToday.map((f) => f.windMs));
    const grounded = flightsToday.every((f) => f.status === 'aborted');
    out.push({
      id: 'flight',
      kind: 'flight',
      severity: 'warning',
      title: grounded
        ? { en: 'The drone stayed on the ground this morning', zh: '今晨无人机未起飞' }
        : { en: 'The drone flew a shortened round', zh: '无人机航线缩短' },
      what: grounded
        ? {
            en: `Wind reached ${wind.toFixed(1)} m/s, above the ${FARM.flights.groundedAboveWindMs} m/s launch limit, so there was no count this morning and the numbers carry over from the last flight.`,
            zh: `风速达 ${wind.toFixed(1)} m/s，超过 ${FARM.flights.groundedAboveWindMs} m/s 起飞限值，今晨未清点，数据沿用上一次航拍。`,
          }
        : {
            en: `Wind reached ${wind.toFixed(1)} m/s, above the ${FARM.flights.shortenedAboveWindMs} m/s limit for a full round, so the drone flew a shorter route and part of the ground was not covered.`,
            zh: `风速达 ${wind.toFixed(1)} m/s，超过完整航线所需的 ${FARM.flights.shortenedAboveWindMs} m/s 限值，航线缩短，部分区域未覆盖。`,
          },
      why: {
        en: 'An incomplete count looks exactly like missing cattle. Treat this morning\'s numbers as provisional rather than sending anyone out to search.',
        zh: '不完整的清点与真正走失难以区分，今晨数据应视为临时结果，不必据此派人搜寻。',
      },
      task: { en: 'Fly the count again when the wind drops', zh: '待风力减弱后重新航拍' },
      action: {
        en: 'Fly the count again as soon as the wind drops. Nothing here needs anyone to ride out.',
        zh: '待风力减弱后重新航拍清点。此项无需派人前往。',
      },
    });
  }

  return dedupe(out.sort((a, b) => RANK[a.severity] - RANK[b.severity]));
}

/**
 * Backstop against two jobs that read the same. Whatever the findings behind them, a list
 * that tells someone twice to check cows in the same herd and the same area is a list
 * that will be ignored — so the first (most severe) one keeps the line, and the rest fold
 * their animals into it.
 */
function dedupe(issues: Issue[]): Issue[] {
  const seen = new Map<string, Issue>();
  const out: Issue[] = [];
  for (const issue of issues) {
    const key = issue.task.en;
    const first = seen.get(key);
    if (!first) {
      seen.set(key, issue);
      out.push(issue);
      continue;
    }
    first.cowIds = [...new Set([...(first.cowIds ?? []), ...(issue.cowIds ?? [])])];
  }
  return out;
}

export const issueSeverityOf = (cows: CowState[]) =>
  cows.length ? cowSeverity(cows[0]) : ('good' as Severity);
