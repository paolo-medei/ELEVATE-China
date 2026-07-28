import { useEffect, useMemo, useState } from 'react';
import { useUi } from '../i18n';
import { HerdMap } from '../components/HerdMap';
import { Segmented } from '../components/ui';
import { cowSeverity, cowSnapshot, elevationAt } from '../data/animals';
import { paddockById, TOTAL_HEAD } from '../data/ranch';
import { buildIssues } from '../lib/issues';
import { paddockState } from '../lib/status';
import { formatLatLon, toLatLon } from '../lib/geo';
import { fmt, SERIES_VAR, STATUS_VAR } from '../lib/format';
import type { Dataset } from '../data/types';

/** The dashboard reads the herd as the dawn muster flight left it. */
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
  const { t, b, lang } = useUi();
  const [herdFilter, setHerdFilter] = useState<string | null>(null);
  const [selectedCow, setSelectedCow] = useState<string | null>(null);
  const [hour, setHour] = useState(SNAPSHOT_HOUR);
  const [playing, setPlaying] = useState(false);

  // the numbers on this page belong to the morning count; only the map moves with the hour
  const cows = useMemo(() => cowSnapshot(data, day, SNAPSHOT_HOUR), [data, day]);
  const mapCows = useMemo(
    () => (hour === SNAPSHOT_HOUR ? cows : cowSnapshot(data, day, hour)),
    [cows, data, day, hour],
  );

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setHour((h) => (h + 1) % 24), 700);
    return () => window.clearInterval(id);
  }, [playing]);
  const issues = useMemo(() => buildIssues(data, day, cows), [data, day, cows]);

  const detections = data.flights.filter((f) => f.day === day).flatMap((f) => f.detections);
  const seen = detections.reduce((a, d) => a + d.detected, 0);
  const lastFlight = [...data.flights]
    .filter((f) => f.day <= day && f.detections.length > 0)
    .pop();

  const herdDays = data.herdDays.filter((hd) => hd.day === day);
  const walked = herdDays.reduce((a, hd) => a + hd.distanceKm, 0) / Math.max(1, herdDays.length);
  const areasToday = data.paddockDays.filter((pd) => pd.day === day);
  const green = areasToday.reduce((a, pd) => a + pd.ndvi, 0) / Math.max(1, areasToday.length);

  const attention = cows.filter(
    (c) => c.flags.includes('isolated') && c.flags.includes('stationary'),
  );
  const missingByHerd = data.herds.map((h) => ({
    herd: h,
    missing: cows.filter((c) => c.cow.herdId === h.id && c.surveyed && !c.detected).length,
    separated: cows.filter((c) => c.cow.herdId === h.id && c.flags.includes('separated')).length,
  }));

  const shown = herdFilter ? mapCows.filter((c) => c.cow.herdId === herdFilter) : mapCows;
  const mapHighlight = mapCows.filter(
    (c) =>
      c.flags.includes('isolated') &&
      c.flags.includes('stationary') &&
      (!herdFilter || c.cow.herdId === herdFilter),
  );
  const selected = selectedCow ? cows.find((c) => c.cow.id === selectedCow) : null;

  const gpsOf = (p: { x: number; y: number }) =>
    formatLatLon(toLatLon(p, data.meta.origin, data.meta.metresPerDegLat, data.meta.metresPerDegLon));

  const worst = issues[0]?.severity ?? 'good';

  return (
    <>
      {/* ---------------- warning panel ---------------- */}
      <section className={`warn-panel ${worst}`}>
        <header className="warn-head">
          <span className="warn-icon" aria-hidden="true">
            {worst === 'good' ? '✓' : '!'}
          </span>
          <div>
            <h1 className="warn-title">
              {issues.length === 0 ? t('bigAllSafe') : t('warnTitle', { n: issues.length })}
            </h1>
            <p className="warn-sub">
              {data.weather[day].date} ·{' '}
              {data.weather[day].rainMm > 0
                ? `${data.weather[day].rainMm} mm`
                : lang === 'zh'
                  ? '无降水'
                  : 'no rain'}{' '}
              · {data.weather[day].tempC.toFixed(0)}°C · {data.weather[day].windMs.toFixed(1)} m/s
            </p>
          </div>
          <div className="warn-nav">
            <button type="button" className="big-btn" onClick={() => onDay(Math.max(0, day - 1))}>
              ←
            </button>
            <button
              type="button"
              className="big-btn"
              onClick={() => onDay(Math.min(data.meta.days - 1, day + 1))}
            >
              →
            </button>
          </div>
        </header>

        <div className="warn-grid">
          <div className="warn-block">
            <h2 className="warn-block-title">{t('warnMissing')}</h2>
            <ul className="warn-list">
              {missingByHerd.map(({ herd, missing, separated }) => (
                <li key={herd.id}>
                  <span
                    className="warn-dot"
                    style={{ background: SERIES_VAR(Number(herd.color.slice(1))) }}
                  />
                  <span className="warn-herd">{b(herd.name)}</span>
                  <span
                    className={`warn-num ${missing > 0 ? 'bad' : separated > 0 ? 'warn' : 'ok'}`}
                  >
                    {missing > 0
                      ? t('warnMissingN', { n: missing, all: herd.head })
                      : separated > 0
                        ? t('warnSeparatedN', { n: separated })
                        : t('warnAllPresent', { n: herd.head })}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="warn-block">
            <h2 className="warn-block-title">{t('warnUrgent')}</h2>
            {attention.length === 0 ? (
              <p className="warn-none">{t('warnNoUrgent')}</p>
            ) : (
              <ul className="warn-list">
                {attention.map((c) => (
                  <li key={c.cow.id}>
                    <span className="warn-dot" style={{ background: STATUS_VAR.critical }} />
                    <span className="warn-herd">
                      {lang === 'zh' ? '牛 ' : 'Cow '}
                      {c.cow.id}
                    </span>
                    <span className="warn-detail">
                      {t('warnUrgentDetail', {
                        m: fmt(c.fromHerdM),
                        h: c.stillHours.toFixed(0),
                      })}
                      <span className="mono gps">{gpsOf(c.at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* ---------------- key indicators ---------------- */}
      <div className="fact-strip">
        <div className="fact">
          <span className="fact-label">{t('factDetected')}</span>
          <span className="fact-value">
            {fmt(seen)} <small>/ {fmt(TOTAL_HEAD)}</small>
          </span>
          <span className="fact-note">{t('factDetectedNote')}</span>
        </div>
        <div className="fact">
          <span className="fact-label">{t('factFlight')}</span>
          <span className="fact-value small">
            {lastFlight
              ? `${data.weather[lastFlight.day].date} · ${String(lastFlight.hour).padStart(2, '0')}:00`
              : '—'}
          </span>
          <span className="fact-note">
            {lastFlight ? `${fmt(lastFlight.coverageHa)} ${t('hectares')} · ${t(lastFlight.status)}` : ''}
          </span>
        </div>
        <div className="fact">
          <span className="fact-label">{t('factWalked')}</span>
          <span className="fact-value">
            {walked.toFixed(1)} <small>km</small>
          </span>
          <span className="fact-note">{t('perHead')}</span>
        </div>
        <div className="fact">
          <span className="fact-label">{t('factGreen')}</span>
          <span className="fact-value">
            {green.toFixed(2)}{' '}
            <small>
              {green >= 0.6 ? t('factGreenGood') : green >= 0.45 ? t('factGreenFair') : t('factGreenPoor')}
            </small>
          </span>
          <span className="fact-note">
            {t('factAreasOut', {
              n: areasToday.filter((pd) => paddockState(pd) === 'outOfGrass').length,
            })}
          </span>
        </div>
      </div>

      {/* ---------------- map ---------------- */}
      <section className="card big-card">
        <div className="row-between">
          <h2 className="big-title">{t('bigWhere')}</h2>
          <Segmented<string>
            value={herdFilter ?? 'all'}
            onChange={(v) => {
              setHerdFilter(v === 'all' ? null : v);
              setSelectedCow(null);
            }}
            options={[
              { value: 'all', label: t('allHerds') },
              ...data.herds.map((h) => ({ value: h.id, label: b(h.name) })),
            ]}
          />
        </div>
        <p className="big-sub">{herdFilter ? t('mapHerdSub', { n: fmt(shown.length) }) : t('mapAllSub')}</p>

        <HerdMap
          data={data}
          day={day}
          hour={hour}
          herdFilter={herdFilter}
          cowStates={shown}
          highlight={mapHighlight}
          selectedCow={selectedCow}
          onSelectCow={setSelectedCow}
        />

        <div className="hour-row">
          <button
            type="button"
            className="play-btn"
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? t('pause') : t('play')}
          >
            {playing ? (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <rect x="1" y="1" width="3.5" height="10" rx="1" fill="currentColor" />
                <rect x="7.5" y="1" width="3.5" height="10" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 1.2 L11 6 L2 10.8 Z" fill="currentColor" />
              </svg>
            )}
          </button>
          <label htmlFor="hour-slider">{t('hour')}</label>
          <input
            id="hour-slider"
            type="range"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => {
              setPlaying(false);
              setHour(Number(e.target.value));
            }}
          />
          <span className="hour-readout">{String(hour).padStart(2, '0')}:00</span>
        </div>
        <p className="big-sub">{t('mapPlayHint')}</p>

        {selected && (
          <div className="cow-detail">
            <div className="cow-detail-head">
              <span
                className="big-herd-dot"
                style={{ background: SERIES_VAR(Number(selected.cow.herdId.slice(1))) }}
              >
                {selected.cow.herdId.slice(1)}
              </span>
              <div>
                <div className="cow-id">
                  {lang === 'zh' ? '牛 ' : 'Cow '}
                  {selected.cow.id}
                </div>
                <div className="big-sub mono">{gpsOf(selected.at)}</div>
              </div>
              <span className={`big-herd-tag ${cowSeverity(selected) === 'warning' ? 'unsure' : 'bad'}`}>
                {selected.flags.length
                  ? selected.flags.map((f) => t(`flag_${f}` as 'flag_isolated')).join(' · ')
                  : t('bigAllHere')}
              </span>
              <button type="button" className="ghost-btn" onClick={() => setSelectedCow(null)}>
                ✕
              </button>
            </div>
            <dl className="cow-facts">
              <div>
                <dt>{t('cowSeen')}</dt>
                <dd>
                  {selected.detected
                    ? t('cowSeenNow')
                    : selected.lastSeenDaysAgo === 1
                      ? t('cowSeenYesterday')
                      : t('cowSeenDaysAgo', { n: selected.lastSeenDaysAgo })}
                </dd>
              </div>
              <div>
                <dt>{t('confidence')}</dt>
                <dd>{selected.detected ? `${selected.confidencePct}%` : '—'}</dd>
              </div>
              <div>
                <dt>{t('cowHeight')}</dt>
                <dd>{elevationAt(selected.at)} m</dd>
              </div>
              <div>
                <dt>{t('cowWalked')}</dt>
                <dd>{selected.distanceKm.toFixed(1)} km</dd>
              </div>
              <div>
                <dt>{t('cowStill')}</dt>
                <dd>{selected.stillHours.toFixed(1)} h</dd>
              </div>
              <div>
                <dt>{t('cowFromHerd')}</dt>
                <dd>{fmt(selected.fromHerdM)} m</dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      {/* ---------------- jobs ---------------- */}
      <section className="card big-card">
        <h2 className="big-title">{t('bigToDo')}</h2>
        {issues.length === 0 ? (
          <p className="big-nothing">✓ {t('bigNothing')}</p>
        ) : (
          <ol className="big-jobs">
            {issues.slice(0, 6).map((issue) => (
              <li key={issue.id} className={`big-job ${issue.severity}`}>
                <span className="big-job-dot" aria-hidden="true" />
                <span>{b(issue.task)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ---------------- herd detail ---------------- */}
      <section className="card big-card">
        <h2 className="big-title">{t('bigHerds')}</h2>
        <div className="big-herds">
          {data.herds.map((h) => {
            const step = data.stepIndex[day][SNAPSHOT_HOUR].find((s) => s.herdId === h.id);
            const hd = data.herdDays.find((x) => x.day === day && x.herdId === h.id);
            const herdCows = cows.filter((c) => c.cow.herdId === h.id);
            const missing = herdCows.filter((c) => c.surveyed && !c.detected).length;
            const needsCheck = herdCows.filter((c) => c.flags.some((f) => f !== 'notFound')).length;
            const area = step ? paddockById.get(step.paddockId)! : null;
            const urgent = herdCows.filter(
              (c) => c.flags.includes('isolated') && c.flags.includes('stationary'),
            ).length;
            const longGone = herdCows.filter(
              (c) => c.surveyed && !c.detected && c.lastSeenDaysAgo >= 3,
            ).length;
            const light =
              urgent > 0 || longGone > 0
                ? STATUS_VAR.critical
                : missing > 0 || needsCheck > 0
                  ? STATUS_VAR.warning
                  : STATUS_VAR.good;
            return (
              <div className="big-herd" key={h.id}>
                <span className="big-herd-top">
                  <span
                    className="big-herd-dot"
                    style={{ background: SERIES_VAR(Number(h.color.slice(1))) }}
                  >
                    {h.id.slice(1)}
                  </span>
                  <span className="herd-light" style={{ background: light }} />
                </span>
                <span className="big-herd-name">{b(h.name)}</span>
                <dl className="herd-facts">
                  <div>
                    <dt>{t('head')}</dt>
                    <dd>
                      {fmt(h.head - missing)} / {fmt(h.head)}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('paddock')}</dt>
                    <dd>{area ? b(area.name) : '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('factWalked')}</dt>
                    <dd>{(hd?.distanceKm ?? 0).toFixed(1)} km</dd>
                  </div>
                  <div>
                    <dt>{t('grazing')}</dt>
                    <dd>{((hd?.budget.grazing ?? 0) / 60).toFixed(1)} h</dd>
                  </div>
                  <div>
                    <dt>{t('needCheck')}</dt>
                    <dd>{needsCheck}</dd>
                  </div>
                  <div>
                    <dt>{t('herdLongGone')}</dt>
                    <dd style={{ color: longGone ? 'var(--critical)' : undefined }}>{longGone}</dd>
                  </div>
                </dl>
                {step && <span className="mono gps">{gpsOf(step.at)}</span>}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
