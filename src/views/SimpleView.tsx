import { useMemo, useState } from 'react';
import { useUi } from '../i18n';
import { Card, Meter, StatTile, StatusBadge } from '../components/ui';
import { Sparkline } from '../components/charts';
import { RanchMap } from '../components/RanchMap';
import { paddockById, TOTAL_HEAD } from '../data/ranch';
import { actionsForDay, grassLeft, paddockState, STATE_SEVERITY } from '../lib/status';
import { fmt, SERIES_VAR, STATUS_VAR } from '../lib/format';
import type { Dataset } from '../data/types';

/** The hour of day the simple view shows: after the dawn muster flight. */
const SNAPSHOT_HOUR = 8;

export function SimpleView({
  data,
  day,
  onDay,
}: {
  data: Dataset;
  day: number;
  onDay: (d: number) => void;
}) {
  const { t, b, lang } = useUi();
  const [openWhy, setOpenWhy] = useState<string | null>(null);

  const counts = useMemo(() => {
    const dets = data.flights.filter((f) => f.day === day).flatMap((f) => f.detections);
    if (!dets.length) return null;
    return {
      detected: dets.reduce((a, d) => a + d.detected, 0),
      surveyed: dets.reduce((a, d) => a + d.expected, 0),
      byHerd: new Map(dets.map((d) => [d.herdId, d])),
    };
  }, [data.flights, day]);

  const missing = counts ? counts.surveyed - counts.detected : null;
  const actions = useMemo(() => actionsForDay(data, day), [data, day]);
  const dayRows = useMemo(() => data.paddockDays.filter((pd) => pd.day === day), [data.paddockDays, day]);
  const outOfGrass = dayRows.filter((pd) => ['move', 'spent'].includes(paddockState(pd)));

  const grazingHours = useMemo(() => {
    const rows = data.herdDays.filter((hd) => hd.day === day);
    const head = rows.reduce((a, hd) => a + data.herds.find((h) => h.id === hd.herdId)!.head, 0);
    return (
      rows.reduce((a, hd) => {
        const herd = data.herds.find((h) => h.id === hd.herdId)!;
        return a + (hd.budget.grazing / 60) * herd.head;
      }, 0) / Math.max(1, head)
    );
  }, [data.herdDays, data.herds, day]);

  const seenTrend = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const d = Math.max(0, day - 13 + i);
        const dets = data.flights.filter((f) => f.day === d).flatMap((x) => x.detections);
        return dets.length ? dets.reduce((a, x) => a + x.detected, 0) : TOTAL_HEAD;
      }),
    [data.flights, day],
  );

  // a couple of hidden animals per hundred is ordinary occlusion; only a herd
  // over the alert threshold counts as genuinely missing
  const worstHerd = useMemo(() => {
    if (!counts) return null;
    let worst: { herdId: string; gap: number; share: number } | null = null;
    for (const [herdId, d] of counts.byHerd) {
      const gap = d.expected - d.detected;
      const share = gap / Math.max(1, d.expected);
      if (share >= 0.03 && (!worst || share > worst.share)) worst = { herdId, gap, share };
    }
    return worst;
  }, [counts]);

  const headline = (() => {
    if (counts == null) return { text: t('simpleHeadlineNoFlight'), severity: 'warning' as const };
    if (worstHerd) {
      const herd = data.herds.find((h) => h.id === worstHerd.herdId)!;
      return {
        text: t('simpleMissingHerd', { n: worstHerd.gap, herd: b(herd.name) }),
        severity: worstHerd.share >= 0.06 ? ('critical' as const) : ('serious' as const),
      };
    }
    return { text: t('simpleHeadlineOk'), severity: 'good' as const };
  })();

  const steps = data.stepIndex[day][SNAPSHOT_HOUR];

  return (
    <>
      {/* one line that answers "is everything alright?" before any number */}
      <section className={`headline ${headline.severity}`}>
        <span className="headline-dot" aria-hidden="true" />
        <span className="headline-text">{headline.text}</span>
        <span className="headline-meta">
          {missing != null && missing > 0 && !worstHerd && (
            <>{t('simpleHidden', { n: missing })} · </>
          )}
          {data.weather[day].date} ·{' '}
          {data.weather[day].rainMm > 0
            ? `${data.weather[day].rainMm} mm`
            : lang === 'zh'
              ? '无降水'
              : 'no rain'}{' '}
          · {data.weather[day].tempC.toFixed(0)}°C
        </span>
        <span className="headline-nav">
          <button type="button" className="ghost-btn" onClick={() => onDay(Math.max(0, day - 1))}>
            ←<span className="sr-only">{t('prevDay')}</span>
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => onDay(Math.min(data.meta.days - 1, day + 1))}
          >
            →<span className="sr-only">{t('nextDay')}</span>
          </button>
          <button type="button" className="ghost-btn" onClick={() => onDay(data.meta.days - 1)}>
            {t('latestDay')}
          </button>
        </span>
      </section>

      <div className="kpi-row">
        <StatTile
          label={t('simpleSeen')}
          value={counts ? fmt(counts.detected) : '—'}
          unit={t('head')}
          foot={t('simpleSeenFoot', { n: TOTAL_HEAD })}
        >
          <Sparkline values={seenTrend} color={SERIES_VAR(1)} />
        </StatTile>
        <StatTile
          label={t('simpleNeedsYou')}
          value={actions.length}
          foot={t('simpleNeedsYouFoot')}
          badge={
            <StatusBadge severity={actions[0]?.severity ?? 'good'}>
              {actions.length ? t(actions[0].severity === 'critical' ? 'state_move' : 'ruleWatch') : t('rulePassed')}
            </StatusBadge>
          }
        />
        <StatTile
          label={t('simpleMovePaddocks')}
          value={outOfGrass.length}
          foot={t('simpleMoveFoot')}
          badge={
            <StatusBadge severity={outOfGrass.length ? 'serious' : 'good'}>
              {outOfGrass.length
                ? outOfGrass.map((pd) => paddockById.get(pd.paddockId)!.code).join(' ')
                : t('rulePassed')}
            </StatusBadge>
          }
        />
        <StatTile
          label={t('simpleGrazing')}
          value={grazingHours.toFixed(1)}
          unit={t('hours')}
          foot={t('simpleGrazingNormal')}
          badge={
            <StatusBadge severity={grazingHours >= 9 ? 'good' : grazingHours >= 7.5 ? 'warning' : 'serious'}>
              {grazingHours >= 9 ? t('rulePassed') : t('ruleWatch')}
            </StatusBadge>
          }
        />
      </div>

      <div className="simple-grid">
        <Card title={t('whereTitle')} sub={t('whereSub')} flush>
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
          <div style={{ padding: '10px 8px 0' }}>
            <input
              type="range"
              min={0}
              max={data.meta.days - 1}
              value={day}
              onChange={(e) => onDay(Number(e.target.value))}
              aria-label={t('day')}
            />
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card title={t('todoTitle')} sub={t('todoSub')} flush>
          {actions.length === 0 ? (
            <div style={{ padding: '18px 16px' }}>
              <div className="row-title" style={{ marginBottom: 4 }}>
                ✓ {t('todoEmpty')}
              </div>
              <div className="note">{t('todoEmptySub')}</div>
            </div>
          ) : (
            <div className="list">
              {actions.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  className="list-row"
                  onClick={() => setOpenWhy(openWhy === a.id ? null : a.id)}
                >
                  <span className={`rail ${a.severity}`} aria-hidden="true" />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="row-title">{b(a.text)}</span>
                    {openWhy === a.id && (
                      <span className="row-detail" style={{ display: 'block' }}>
                        <strong>{t('simpleWhyDetail')}: </strong>
                        {b(a.why)}
                      </span>
                    )}
                  </span>
                  <span className="note" aria-hidden="true">
                    {openWhy === a.id ? '−' : '+'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
        <Card title={t('grassTableTitle')} sub={t('simpleFootnote')} flush>
          <div className="list" style={{ maxHeight: 380 }}>
            {[...dayRows]
              .sort((a, b2) => b2.utilization - a.utilization)
              .map((pd) => {
                const p = paddockById.get(pd.paddockId)!;
                const state = paddockState(pd);
                const grazedBy = data.herdDays.find(
                  (hd) => hd.day === day && hd.paddockId === pd.paddockId,
                );
                return (
                  <div className="grass-row" key={pd.paddockId}>
                    <span className={`rail ${STATE_SEVERITY[state]}`} aria-hidden="true" />
                    <span style={{ minWidth: 120, flex: '1 1 120px' }}>
                      <span className="row-title">{b(p.name)}</span>
                      <span className="row-meta">
                        {grazedBy
                          ? `${b(data.herds.find((h) => h.id === grazedBy.herdId)!.name)}`
                          : t('restingFor', { n: pd.restDays })}
                      </span>
                    </span>
                    <span style={{ flex: '1 1 120px', minWidth: 110 }}>
                      <span
                        className="row-meta"
                        style={{ marginTop: 0, justifyContent: 'space-between' }}
                      >
                        <span>{t('grassUsed')}</span>
                        <span style={{ color: pd.utilization > 1 ? 'var(--critical)' : undefined }}>
                          {Math.round(pd.utilization * 100)}%
                        </span>
                      </span>
                      <Meter
                        value={Math.min(1, pd.utilization)}
                        target={1}
                        color={STATUS_VAR[STATE_SEVERITY[state]]}
                      />
                      <span className="row-meta">
                        {t('grassLeft')} {Math.round(grassLeft(pd) * 100)}%
                      </span>
                    </span>
                    <span style={{ flex: '0 0 auto' }}>
                      <StatusBadge severity={STATE_SEVERITY[state]}>
                        {t(`state_${state}` as 'state_ok')}
                      </StatusBadge>
                    </span>
                  </div>
                );
              })}
          </div>
        </Card>
        </div>
      </div>

      <div>
        <Card title={t('herdCardsTitle')} flush>
          <div className="herd-cards">
            {data.herds.map((h) => {
              const step = steps.find((s) => s.herdId === h.id);
              const det = counts?.byHerd.get(h.id);
              const gap = det ? det.expected - det.detected : 0;
              const short = det ? gap / Math.max(1, det.expected) >= 0.03 : false;
              const paddock = step ? paddockById.get(step.paddockId)! : null;
              return (
                <div className="herd-card" key={h.id}>
                  <span
                    className="herd-chip"
                    style={{ background: SERIES_VAR(Number(h.color.slice(1))) }}
                    aria-hidden="true"
                  />
                  <div style={{ minWidth: 0 }}>
                    <div className="row-title">{b(h.name)}</div>
                    <div className="row-detail">
                      {fmt(h.head)} {t('head')}
                      {paddock && ` · ${b(paddock.name)}`}
                      {step && ` · ${t(step.state)}`}
                    </div>
                    <div className="row-meta">
                      {det ? (
                        <span style={{ color: short ? 'var(--serious)' : undefined }}>
                          {det.detected} {t('seenToday')}
                          {short ? ` · −${gap}` : ' ✓'}
                        </span>
                      ) : (
                        <span>{t('simpleHeadlineNoFlight')}</span>
                      )}
                      {step?.offPaddock && <span style={{ color: 'var(--critical)' }}>⚠ {t('fenceBreach')}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

      </div>
    </>
  );
}
