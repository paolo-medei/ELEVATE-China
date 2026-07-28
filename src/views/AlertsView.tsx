import { useMemo } from 'react';
import { useUi } from '../i18n';
import { cowSeverity, cowSnapshot, FLAG_SEVERITY, type CowFlag } from '../data/animals';
import { actionsForDay } from '../lib/status';
import { fmt, SERIES_VAR } from '../lib/format';
import type { Dataset } from '../data/types';

const FLAG_ORDER: CowFlag[] = ['notFound', 'sick', 'isolated', 'stationary'];

export function AlertsView({ data, day, hour }: { data: Dataset; day: number; hour: number }) {
  const { t, b, lang } = useUi();

  const flagged = useMemo(
    () =>
      cowSnapshot(data, day, hour)
        .filter((c) => c.flags.length > 0)
        .sort((a, b2) => {
          const rank = { critical: 0, serious: 1, warning: 2 } as const;
          return (
            rank[cowSeverity(a)] - rank[cowSeverity(b2)] ||
            b2.lastSeenDaysAgo - a.lastSeenDaysAgo ||
            FLAG_ORDER.indexOf(a.flags[0]) - FLAG_ORDER.indexOf(b2.flags[0]) ||
            b2.fromHerdM - a.fromHerdM
          );
        }),
    [data, day, hour],
  );

  const herdJobs = useMemo(() => actionsForDay(data, day), [data, day]);
  const byFlag = (f: CowFlag) => flagged.filter((c) => c.flags[0] === f);

  return (
    <>
      <section className="card big-card">
        <h2 className="big-title">{t('navAlerts')}</h2>
        <p className="big-sub">{t('alertsPageSub')}</p>

        <div className="flag-summary">
          {FLAG_ORDER.map((f) => (
            <div className={`flag-tile ${FLAG_SEVERITY[f]}`} key={f}>
              <span className="flag-count">{fmt(byFlag(f).length)}</span>
              <span className="flag-name">{t(`flag_${f}` as 'flag_isolated')}</span>
            </div>
          ))}
        </div>

        {flagged.length === 0 ? (
          <p className="big-nothing">✓ {t('alertsNone')}</p>
        ) : (
          <div className="alert-list">
            {flagged.slice(0, 40).map((c) => {
              const herd = data.herds.find((h) => h.id === c.cow.herdId)!;
              return (
                <div className={`alert-row ${cowSeverity(c)}`} key={c.cow.id}>
                  <span
                    className="alert-dot"
                    style={{ background: SERIES_VAR(Number(herd.color.slice(1))) }}
                  />
                  <span className="alert-cow">
                    {lang === 'zh' ? '牛 ' : 'Cow '}
                    {c.cow.id}
                  </span>
                  <span className="alert-what">
                    {c.flags.map((f) => t(`flag_${f}` as 'flag_isolated')).join(' · ')}
                  </span>
                  <span className="alert-where">
                    {b(herd.name)} · {fmt(c.fromHerdM)} m {lang === 'zh' ? '离群' : 'from the group'}
                    {!c.detected &&
                      ` · ${c.lastSeenDaysAgo >= 60 ? t('cowSeenLong') : (c.lastSeenDaysAgo === 1 ? t('cowSeenYesterday') : t('cowSeenDaysAgo', { n: c.lastSeenDaysAgo }))}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card big-card">
        <h2 className="big-title">{t('alertsHerdTitle')}</h2>
        {herdJobs.length === 0 ? (
          <p className="big-nothing">✓ {t('bigNothing')}</p>
        ) : (
          <ol className="big-jobs">
            {herdJobs.map((job) => (
              <li key={job.id} className={`big-job ${job.severity}`}>
                <span className="big-job-dot" aria-hidden="true" />
                <span>
                  {b(job.text)}
                  <span className="big-why">{b(job.why)}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
