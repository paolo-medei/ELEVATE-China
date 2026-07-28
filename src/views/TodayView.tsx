import { useMemo } from 'react';
import { useUi } from '../i18n';
import { RanchMap } from '../components/RanchMap';
import { paddockById, TOTAL_HEAD } from '../data/ranch';
import { actionsForDay, paddockState } from '../lib/status';
import { fmt, SERIES_VAR } from '../lib/format';
import type { Dataset } from '../data/types';

/** The whole app is this one screen: is everything alright, where are they, what to do. */
const SNAPSHOT_HOUR = 8;

export function TodayView({
  data,
  day,
  onDay,
}: {
  data: Dataset;
  day: number;
  onDay: (d: number) => void;
}) {
  const { t, b } = useUi();

  const detections = useMemo(
    () => new Map(data.flights.filter((f) => f.day === day).flatMap((f) => f.detections).map((d) => [d.herdId, d])),
    [data.flights, day],
  );

  /** Only a herd short by more than 3% counts as missing; the rest is camera occlusion. */
  const shortHerds = data.herds.filter((h) => {
    const d = detections.get(h.id);
    return d ? (d.expected - d.detected) / d.expected >= 0.03 : false;
  });

  const seen = [...detections.values()].reduce((a, d) => a + d.detected, 0);
  // on a windy day the drone cuts the mission short and misses more animals; that is a
  // flight problem, not a missing-cattle problem, and the screen must not confuse the two
  const flightFinished = data.flights.some(
    (f) => f.day === day && f.detections.length > 0 && f.status === 'complete',
  );
  const jobs = useMemo(() => actionsForDay(data, day).slice(0, 3), [data, day]);

  const lastFlight = [...data.flights]
    .filter((f) => f.day <= day && f.status !== 'aborted')
    .pop();
  const herdDays = data.herdDays.filter((hd) => hd.day === day);
  const walked = herdDays.reduce((a, hd) => a + hd.distanceKm, 0) / Math.max(1, herdDays.length);
  const areas = data.paddockDays.filter((pd) => pd.day === day);
  const greenness = areas.reduce((a, pd) => a + pd.ndvi, 0) / Math.max(1, areas.length);
  const areasOut = areas.filter((pd) => paddockState(pd) === 'outOfGrass').length;
  const steps = data.stepIndex[day][SNAPSHOT_HOUR];

  const ok = shortHerds.length === 0 && detections.size > 0;
  const severity = !flightFinished ? 'warning' : ok ? 'good' : 'critical';
  const headline =
    detections.size === 0
      ? t('simpleHeadlineNoFlight')
      : !flightFinished
        ? t('bigFlightShort')
        : ok
        ? t('bigAllSafe')
        : t('bigMissing', {
            n: shortHerds.reduce((a, h) => {
              const d = detections.get(h.id)!;
              return a + (d.expected - d.detected);
            }, 0),
            herd: b(shortHerds[0].name),
          });

  return (
    <>
      <section className={`big-banner ${severity}`}>
        <span className="big-icon" aria-hidden="true">
          {severity === 'good' ? '✓' : severity === 'warning' ? '?' : '!'}
        </span>
        <span>
          <span className="big-headline">{headline}</span>
          <span className="big-count">
            {detections.size ? t('bigSeen', { seen: fmt(seen), all: fmt(TOTAL_HEAD) }) : ''}
          </span>
        </span>
        <span className="big-days">
          <button type="button" className="big-btn" onClick={() => onDay(Math.max(0, day - 1))}>
            ←
          </button>
          <span className="big-date">{data.weather[day].date}</span>
          <button
            type="button"
            className="big-btn"
            onClick={() => onDay(Math.min(data.meta.days - 1, day + 1))}
          >
            →
          </button>
        </span>
      </section>

      <section className="fact-strip">
        <div className="fact">
          <span className="fact-label">{t('factCows')}</span>
          <span className="fact-value">{fmt(TOTAL_HEAD)}</span>
        </div>
        <div className="fact">
          <span className="fact-label">{t('factFlight')}</span>
          <span className="fact-value small">
            {lastFlight
              ? `${data.weather[lastFlight.day].date} · ${String(lastFlight.hour).padStart(2, '0')}:00`
              : '—'}
          </span>
        </div>
        <div className="fact">
          <span className="fact-label">{t('factWalked')}</span>
          <span className="fact-value">
            {walked.toFixed(1)} <small>km</small>
          </span>
        </div>
        <div className="fact">
          <span className="fact-label">{t('factGreen')}</span>
          <span className="fact-value">
            {greenness.toFixed(2)}{' '}
            <small>
              {greenness >= 0.6 ? t('factGreenGood') : greenness >= 0.45 ? t('factGreenFair') : t('factGreenPoor')}
            </small>
          </span>
          <span className="fact-note">{t('factAreasOut', { n: areasOut })}</span>
        </div>
      </section>

      <section className="card big-card">
        <h2 className="big-title">{t('bigWhere')}</h2>
        <RanchMap
          data={data}
          day={day}
          hour={SNAPSHOT_HOUR}
          layer="status"
          showTrails={false}
          minimal
          selectedPaddock={null}
          onSelectPaddock={() => {}}
          selectedHerd={null}
          onSelectHerd={() => {}}
        />
      </section>

      <section className="card big-card">
        <h2 className="big-title">{t('bigToDo')}</h2>
        {jobs.length === 0 ? (
          <p className="big-nothing">✓ {t('bigNothing')}</p>
        ) : (
          <ol className="big-jobs">
            {jobs.map((job) => (
              <li key={job.id} className={`big-job ${job.severity}`}>
                <span className="big-job-dot" aria-hidden="true" />
                {b(job.text)}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card big-card">
        <h2 className="big-title">{t('bigHerds')}</h2>
        <div className="big-herds">
          {data.herds.map((h) => {
            const step = steps.find((s) => s.herdId === h.id);
            const det = detections.get(h.id);
            const gap = det ? det.expected - det.detected : 0;
            const short = det ? gap / det.expected >= 0.03 : false;
            return (
              <div className="big-herd" key={h.id}>
                <span className="big-herd-top">
                  <span
                    className="big-herd-dot"
                    style={{ background: SERIES_VAR(Number(h.color.slice(1))) }}
                  >
                    {h.id.slice(1)}
                  </span>
                  <span
                    className="herd-light"
                    style={{
                      background: short
                        ? flightFinished
                          ? 'var(--critical)'
                          : 'var(--warning)'
                        : step?.offPaddock
                          ? 'var(--critical)'
                          : 'var(--good)',
                    }}
                    title={t('herdStatus')}
                  />
                </span>
                <span className="big-herd-name">{b(h.name)}</span>
                <span className="big-herd-line">{t('bigCows', { n: fmt(h.head) })}</span>
                <span className="big-herd-line">
                  {step ? b(paddockById.get(step.paddockId)!.name) : '—'}
                </span>
                <span className="big-herd-line">
                  {t('factWalked')}: {(data.herdDays.find((hd) => hd.day === day && hd.herdId === h.id)?.distanceKm ?? 0).toFixed(1)} km
                </span>
                <span
                  className={`big-herd-tag ${short ? (flightFinished ? 'bad' : 'unsure') : 'good'}`}
                >
                  {short
                    ? flightFinished
                      ? t('bigShort', { n: gap })
                      : t('bigCheckAgain')
                    : t('bigAllHere')}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
