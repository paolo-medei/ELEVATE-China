import { useMemo } from 'react';
import { useUi } from '../i18n';
import { cowSnapshot } from '../data/animals';
import { buildIssues, type Issue } from '../lib/issues';
import { fmt, SERIES_VAR } from '../lib/format';
import type { Dataset } from '../data/types';

const SNAPSHOT_HOUR = 8;

const KIND_LABEL: Record<
  Issue['kind'],
  'flag_notFound' | 'flag_isolated' | 'flag_sick' | 'state_outOfGrass' | 'aborted' | 'restViolation'
> = {
  missing: 'flag_notFound',
  attention: 'flag_isolated',
  sick: 'flag_sick',
  grass: 'state_outOfGrass',
  flight: 'aborted',
  rest: 'restViolation',
};

export function AlertsView({ data, day }: { data: Dataset; day: number }) {
  const { t, b, lang } = useUi();

  const cows = useMemo(() => cowSnapshot(data, day, SNAPSHOT_HOUR), [data, day]);
  const issues = useMemo(() => buildIssues(data, day, cows), [data, day, cows]);

  const counts = {
    critical: issues.filter((i) => i.severity === 'critical').length,
    serious: issues.filter((i) => i.severity === 'serious').length,
    warning: issues.filter((i) => i.severity === 'warning').length,
  };

  return (
    <>
      <section className="card big-card">
        <h2 className="big-title">{t('navAlerts')}</h2>
        <p className="big-sub">
          {t('alertsPageSub')} · {data.weather[day].date}
        </p>
        <div className="flag-summary">
          <div className="flag-tile critical">
            <span className="flag-count">{counts.critical}</span>
            <span className="flag-name">{t('sevCritical')}</span>
          </div>
          <div className="flag-tile serious">
            <span className="flag-count">{counts.serious}</span>
            <span className="flag-name">{t('sevSerious')}</span>
          </div>
          <div className="flag-tile warning">
            <span className="flag-count">{counts.warning}</span>
            <span className="flag-name">{t('sevWarning')}</span>
          </div>
        </div>
      </section>

      {issues.length === 0 && (
        <section className="card big-card">
          <p className="big-nothing">✓ {t('alertsNone')}</p>
        </section>
      )}

      {issues.map((issue) => {
        const herd = issue.herdId ? data.herds.find((h) => h.id === issue.herdId) : undefined;
        return (
          <section className={`card alert-card ${issue.severity}`} key={issue.id}>
            <header className="alert-card-head">
              <span className="alert-badge">{t(KIND_LABEL[issue.kind])}</span>
              <h3 className="alert-card-title">{b(issue.title)}</h3>
              {herd && (
                <span className="alert-herd">
                  <span
                    className="warn-dot"
                    style={{ background: SERIES_VAR(Number(herd.color.slice(1))) }}
                  />
                  {b(herd.name)}
                </span>
              )}
            </header>

            <dl className="alert-body">
              <div>
                <dt>{t('alertWhat')}</dt>
                <dd>{b(issue.what)}</dd>
              </div>
              <div>
                <dt>{t('alertWhy')}</dt>
                <dd>{b(issue.why)}</dd>
              </div>
              <div className="alert-action">
                <dt>{t('alertAction')}</dt>
                <dd>{b(issue.action)}</dd>
              </div>
            </dl>

            <footer className="alert-foot">
              {issue.gps && (
                <span className="mono gps">
                  {t('cowGps')}: {issue.gps}
                </span>
              )}
              {issue.cowIds && issue.cowIds.length > 0 && (
                <span className="alert-cows">
                  {lang === 'zh' ? '涉及：' : 'Animals: '}
                  {issue.cowIds.slice(0, 10).join(', ')}
                  {issue.cowIds.length > 10 && ` +${fmt(issue.cowIds.length - 10)}`}
                </span>
              )}
            </footer>
          </section>
        );
      })}
    </>
  );
}
