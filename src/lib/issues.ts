import { cowSeverity, type CowState } from '../data/animals';
import { paddockById } from '../data/ranch';
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

  /* 1 — animals that are away from the herd and barely moving */
  for (const herd of data.herds) {
    const urgent = cows.filter(
      (c) => c.cow.herdId === herd.id && c.flags.includes('isolated') && c.flags.includes('stationary'),
    );
    if (!urgent.length) continue;
    const worst = urgent[0];
    out.push({
      id: `attention-${herd.id}`,
      kind: 'attention',
      severity: 'critical',
      herdId: herd.id,
      cowIds: urgent.map((c) => c.cow.id),
      gps: gpsOf(worst.at),
      title: {
        en:
          urgent.length === 1
            ? `1 animal in ${herd.name.en} needs checking now`
            : `${urgent.length} animals in ${herd.name.en} need checking now`,
        zh: `${herd.name.zh} 有 ${urgent.length} 头牛需立即查看`,
      },
      what: {
        en: `${urgent.map((c) => c.cow.id).join(' and ')} are ${Math.round(
          urgent.reduce((a, c) => a + c.fromHerdM, 0) / urgent.length,
        )} m from the rest of the herd and have barely moved for ${Math.round(
          urgent.reduce((a, c) => a + c.stillHours, 0) / urgent.length,
        )} hours.`,
        zh: `${urgent.map((c) => c.cow.id).join('、')} 距离牛群约 ${Math.round(
          urgent.reduce((a, c) => a + c.fromHerdM, 0) / urgent.length,
        )} 米，且已静止约 ${Math.round(
          urgent.reduce((a, c) => a + c.stillHours, 0) / urgent.length,
        )} 小时。`,
      },
      why: {
        en: 'Healthy cattle stay with the group and keep grazing. Leaving the herd and lying still is the first sign of injury, calving trouble or illness — and a lone animal is the one wolves take.',
        zh: '健康的牛会跟群并持续采食。离群且长时间卧地，往往是外伤、难产或疾病的最早信号，落单的牛也最易遭狼害。',
      },
      task: {
        en: `Check ${urgent.length} ${urgent.length === 1 ? 'cow' : 'cows'} in ${herd.name.en}${
          areaOf(worst) ? ` — ${areaOf(worst)!.name.en}` : ''
        }`,
        zh: `查看${herd.name.zh}的 ${urgent.length} 头牛${
          areaOf(worst) ? `（${areaOf(worst)!.name.zh}）` : ''
        }`,
      },
      action: {
        en: 'Ride out to the coordinates below today and look the animals over. Bring them back to the herd or down to the camp if they cannot walk well.',
        zh: '今日按下方坐标前往查看。若行走困难，请将其带回牛群或牧点。',
      },
    });
  }

  /* 2 — animals the drone could not find */
  for (const herd of data.herds) {
    const missing = cows.filter((c) => c.cow.herdId === herd.id && c.surveyed && !c.detected);
    if (!missing.length) continue;
    const longGone = missing.filter((c) => c.lastSeenDaysAgo >= 3);
    const severity: Severity = longGone.length ? 'critical' : flightFinished ? 'serious' : 'warning';
    out.push({
      id: `missing-${herd.id}`,
      kind: 'missing',
      severity,
      herdId: herd.id,
      cowIds: missing.map((c) => c.cow.id),
      gps: gpsOf(missing[0].at),
      title: {
        en: `${missing.length} cattle missing from ${herd.name.en}`,
        zh: `${herd.name.zh} 缺 ${missing.length} 头牛`,
      },
      what: flightFinished
        ? {
            en: `The drone counted ${herd.head - missing.length} of ${herd.head}. ${
              longGone.length
                ? `${longGone.length} of them (${longGone.map((c) => c.cow.id).join(', ')}) ${
                    longGone.length === 1 ? 'has' : 'have'
                  } not been seen for ${Math.max(...longGone.map((c) => c.lastSeenDaysAgo))} days.`
                : 'All of them were seen on an earlier flight this week.'
            }`,
            zh: `无人机清点 ${herd.head - missing.length}/${herd.head} 头。${
              longGone.length
                ? `其中 ${longGone.length} 头（${longGone.map((c) => c.cow.id).join('、')}）已 ${Math.max(
                    ...longGone.map((c) => c.lastSeenDaysAgo),
                  )} 天未见。`
                : '其余本周早些时候均被拍到。'
            }`,
          }
        : {
            en: `The flight was cut short by wind, so this count is incomplete: ${
              herd.head - missing.length
            } of ${herd.head} were in frame.`,
            zh: `本次航拍因大风缩短，清点不完整：${herd.head - missing.length}/${herd.head} 头在画面内。`,
          },
      why: longGone.length
        ? {
            en: 'An animal absent from several flights in a row is not hiding under a tree — it has strayed through a fence line, is down in a gully, or has been taken.',
            zh: '连续多次航拍均未出现，通常不是被遮挡，而是已越界走失、跌落沟谷或被捕食。',
          }
        : {
            en: 'One missed count is usually an animal in shadow or under cover. It matters only if the same animal is missing again tomorrow.',
            zh: '单次未识别多为遮挡所致。若次日同一头牛仍未出现，才需重视。',
          },
      task: longGone.length
        ? {
            en: `Find ${longGone.length} missing ${longGone.length === 1 ? 'cow' : 'cows'} in ${herd.name.en}${
              areaOf(missing[0]) ? ` — ${areaOf(missing[0])!.name.en}` : ''
            }`,
            zh: `寻找${herd.name.zh}走失的 ${longGone.length} 头牛${
              areaOf(missing[0]) ? `（${areaOf(missing[0])!.name.zh}）` : ''
            }`,
          }
        : {
            en: `Recount ${herd.name.en} on tomorrow's flight`,
            zh: `次日航拍时复点${herd.name.zh}`,
          },
      action: longGone.length
        ? {
            en: `Search the gullies and the fence line near the coordinates below for ${longGone
              .map((c) => c.cow.id)
              .join(', ')}.`,
            zh: `请在下方坐标附近的沟谷与围栏一带寻找 ${longGone.map((c) => c.cow.id).join('、')}。`,
          }
        : {
            en: `Check the tomorrow morning count for ${herd.name.en}. If the same animals are missing again, ride the fence line near the coordinates below.`,
            zh: `请核对${herd.name.zh}次日清晨的清点结果。若同一批牛仍未出现，请沿下方坐标附近的围栏巡查。`,
          },
    });
  }

  /* 2b — animals that have drifted off the mob but are grazing normally */
  for (const herd of data.herds) {
    const drifted = cows.filter((c) => c.cow.herdId === herd.id && c.flags.includes('separated'));
    if (!drifted.length) continue;
    const area = areaOf(drifted[0]);
    out.push({
      id: `separated-${herd.id}`,
      kind: 'separated',
      severity: 'warning',
      herdId: herd.id,
      cowIds: drifted.map((c) => c.cow.id),
      gps: gpsOf(drifted[0].at),
      title: {
        en: `${drifted.length} cattle have drifted from ${herd.name.en}`,
        zh: `${herd.name.zh} 有 ${drifted.length} 头牛暂时离群`,
      },
      what: {
        en: `${drifted.map((c) => c.cow.id).join(' and ')} are ${Math.round(
          drifted.reduce((a, c) => a + c.fromHerdM, 0) / drifted.length,
        )} m from the mob${area ? ` in ${area.name.en}` : ''}, but still grazing and moving normally.`,
        zh: `${drifted.map((c) => c.cow.id).join('、')} 距牛群约 ${Math.round(
          drifted.reduce((a, c) => a + c.fromHerdM, 0) / drifted.length,
        )} 米${area ? `（${area.name.zh}）` : ''}，但采食与活动均正常。`,
      },
      why: {
        en: 'Animals split off for good reasons — better feed, shade, a calf. It only becomes a problem if they stay out overnight, when they are easy prey and easy to miss at the next count.',
        zh: '牛只离群多因觅食、遮阴或带犊，属正常现象。但若过夜仍未归群，则易遭捕食，也易在下次清点时被遗漏。',
      },
      action: {
        en: 'Push them back to the mob on your next round. No hurry unless they are still out tomorrow.',
        zh: '下次巡场时将其赶回牛群。若次日仍未归群再行处理。',
      },
      task: {
        en: `Bring ${drifted.length} ${drifted.length === 1 ? 'cow' : 'cows'} back to ${herd.name.en}${
          area ? ` — ${area.name.en}` : ''
        }`,
        zh: `将 ${drifted.length} 头牛赶回${herd.name.zh}${area ? `（${area.name.zh}）` : ''}`,
      },
    });
  }

  /* 3 — animals the model flagged for how they move */
  for (const herd of data.herds) {
    const sick = cows.filter((c) => c.cow.herdId === herd.id && c.flags.includes('sick'));
    if (!sick.length) continue;
    const area = areaOf(sick[0]);
    out.push({
      id: `sick-${herd.id}`,
      kind: 'sick',
      severity: 'serious',
      herdId: herd.id,
      cowIds: sick.map((c) => c.cow.id),
      gps: gpsOf(sick[0].at),
      title: {
        en:
          sick.length === 1
            ? `1 animal in ${herd.name.en} is moving abnormally`
            : `${sick.length} animals in ${herd.name.en} are moving abnormally`,
        zh: `${herd.name.zh} 有 ${sick.length} 头牛动作异常`,
      },
      what: {
        en: `The imagery flagged ${sick.map((c) => c.cow.id).join(', ')}${
          area ? ` in ${area.name.en}` : ''
        } for an unusual gait or lying pattern.`,
        zh: `影像识别标记了${area ? `${area.name.zh}的` : ''} ${sick
          .map((c) => c.cow.id)
          .join('、')}，其步态或卧地姿态异常。`,
      },
      why: {
        en: 'Lameness and early illness show up in how an animal walks days before it stops eating. Caught now, most cases are a simple treatment.',
        zh: '跛行与早期疾病会在停食前数日先反映在步态上。及早发现，多数只需简单处置。',
      },
      action: {
        en:
          sick.length === 1
            ? 'Look this animal over at the next muster; check its feet and udder.'
            : 'Look these animals over at the next muster; check feet and udder.',
        zh: '下次集群时逐头检查，重点查蹄部与乳房。',
      },
      task: {
        en: `Check ${sick.length} ${sick.length === 1 ? 'cow' : 'cows'} in ${herd.name.en}${
          area ? ` — ${area.name.en}` : ''
        }`,
        zh: `查看${herd.name.zh}的 ${sick.length} 头牛${area ? `（${area.name.zh}）` : ''}`,
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

  /* 5 — the flight itself */
  if (!flightFinished) {
    out.push({
      id: 'flight',
      kind: 'flight',
      severity: 'warning',
      title: {
        en: 'The drone could not finish its round',
        zh: '无人机未完成巡查',
      },
      what: {
        en: `Wind reached ${Math.max(...flightsToday.map((f) => f.windMs)).toFixed(1)} m/s, above the 11 m/s launch limit, so today's count covers only part of the herd.`,
        zh: `风速达 ${Math.max(...flightsToday.map((f) => f.windMs)).toFixed(1)} m/s，超过 11 m/s 起飞限值，今日清点仅覆盖部分牛群。`,
      },
      why: {
        en: 'An incomplete count looks exactly like missing cattle. Treat today\'s numbers as provisional rather than sending anyone out to search.',
        zh: '不完整的清点与真正走失难以区分，今日数据应视为临时结果，不必据此派人搜寻。',
      },
      task: { en: 'Fly the count again when the wind drops', zh: '待风力减弱后重新航拍' },
      action: {
        en: 'Fly the count again as soon as the wind drops.',
        zh: '待风力减弱后重新航拍清点。',
      },
    });
  }

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

export const issueSeverityOf = (cows: CowState[]) =>
  cows.length ? cowSeverity(cows[0]) : ('good' as Severity);
