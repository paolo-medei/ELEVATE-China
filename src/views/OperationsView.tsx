import { useMemo, useState } from 'react';
import { useUi } from '../i18n';
import { Card, Legend, Meter, Segmented, StatTile, StatusBadge } from '../components/ui';
import { LineChart, Sparkline } from '../components/charts';
import { RanchMap, type MapLayer } from '../components/RanchMap';
import { Timeline } from '../components/Timeline';
import { TOTAL_HEAD, paddockById } from '../data/ranch';
import { fmt, SERIES_VAR, STATUS_VAR, utilisationSeverity } from '../lib/format';
import type { Alert, BehaviourState, Dataset, Severity } from '../data/types';

const BEHAVIOURS: BehaviourState[] = ['grazing', 'ruminating', 'resting', 'travelling', 'watering'];

/** Day-to-day noise hides the seasonal signal over a 120-day window. */
function rollingMean(points: { label: string; values: Record<string, number> }[], window: number) {
  const half = Math.floor(window / 2);
  return points.map((p, i) => {
    const slice = points.slice(Math.max(0, i - half), i + half + 1);
    const values: Record<string, number> = {};
    for (const key of Object.keys(p.values)) {
      values[key] = slice.reduce((a, q) => a + (q.values[key] ?? 0), 0) / slice.length;
    }
    return { label: p.label, values };
  });
}

export function OperationsView({
  data,
  day,
  hour,
  playing,
  onDay,
  onHour,
  onPlaying,
}: {
  data: Dataset;
  day: number;
  hour: number;
  playing: boolean;
  onDay: (d: number) => void;
  onHour: (h: number) => void;
  onPlaying: (p: boolean) => void;
}) {
  const { t, b, lang } = useUi();
  const [layer, setLayer] = useState<MapLayer>('pressure');
  const [showTrails, setShowTrails] = useState(true);
  const [showFlight, setShowFlight] = useState(false);
  const [selectedPaddock, setSelectedPaddock] = useState<string | null>(null);
  const [selectedHerd, setSelectedHerd] = useState<string | null>(null);
  const [alertScope, setAlertScope] = useState<'day' | 'season'>('day');

  /* ---------------- derived series ---------------- */

  const countByDay = useMemo(
    () =>
      Array.from({ length: data.meta.days }, (_, d) => {
        const dets = data.flights.filter((f) => f.day === d).flatMap((f) => f.detections);
        if (!dets.length)
          return {
            day: d,
            detected: null as number | null,
            surveyed: null as number | null,
            confidence: null as number | null,
          };
        return {
          day: d,
          detected: dets.reduce((a, x) => a + x.detected, 0),
          // registered animals that were actually inside a flown paddock
          surveyed: dets.reduce((a, x) => a + x.expected, 0),
          confidence: dets.reduce((a, x) => a + x.confidencePct, 0) / dets.length,
        };
      }),
    [data.flights, data.meta.days],
  );

  const behaviourByDay = useMemo(
    () =>
      Array.from({ length: data.meta.days }, (_, d) => {
        const rows = data.herdDays.filter((hd) => hd.day === d);
        const head = rows.reduce((a, hd) => a + data.herds.find((h) => h.id === hd.herdId)!.head, 0);
        const values: Record<string, number> = {};
        for (const beh of BEHAVIOURS) {
          values[beh] =
            rows.reduce((a, hd) => {
              const herd = data.herds.find((h) => h.id === hd.herdId)!;
              return a + (hd.budget[beh] / 60) * herd.head;
            }, 0) / Math.max(1, head);
        }
        return { label: String(d + 1), values };
      }),
    [data.herdDays, data.herds, data.meta.days],
  );

  // raw daily distance is noisy; a centred weekly mean shows the trend that matters
  const distanceByDay = useMemo(
    () =>
      rollingMean(
        Array.from({ length: data.meta.days }, (_, d) => {
          const values: Record<string, number> = {};
          for (const herd of data.herds) {
            values[herd.id] =
              data.herdDays.find((hd) => hd.day === d && hd.herdId === herd.id)?.distanceKm ?? 0;
          }
          return { label: String(d + 1), values };
        }),
        7,
      ),
    [data.herdDays, data.herds, data.meta.days],
  );

  const today = countByDay[day];
  const detectedToday = today.detected ?? 0;
  // animals missing from the imagery, counted only where the drone actually looked
  const unaccounted = today.detected == null ? null : (today.surveyed ?? 0) - today.detected;
  const notSurveyed = today.surveyed == null ? TOTAL_HEAD : TOTAL_HEAD - today.surveyed;

  const grazingToday = useMemo(() => {
    const rows = data.herdDays.filter((hd) => hd.day === day);
    const head = rows.reduce((a, hd) => a + data.herds.find((h) => h.id === hd.herdId)!.head, 0);
    return rows.reduce((a, hd) => {
      const herd = data.herds.find((h) => h.id === hd.herdId)!;
      return a + (hd.budget.grazing / 60) * herd.head;
    }, 0) / Math.max(1, head);
  }, [data.herdDays, data.herds, day]);

  const distanceToday = useMemo(() => {
    const rows = data.herdDays.filter((hd) => hd.day === day);
    return rows.reduce((a, hd) => a + hd.distanceKm, 0) / Math.max(1, rows.length);
  }, [data.herdDays, day]);

  const healthToday = useMemo(() => {
    const rows = data.paddockDays.filter((pd) => pd.day === day);
    const area = rows.reduce((a, pd) => a + paddockById.get(pd.paddockId)!.areaHa, 0);
    return rows.reduce((a, pd) => a + pd.healthIndex * paddockById.get(pd.paddockId)!.areaHa, 0) / Math.max(1, area);
  }, [data.paddockDays, day]);

  const dayAlerts = useMemo(() => data.alerts.filter((a) => a.day === day), [data.alerts, day]);
  const shownAlerts = alertScope === 'day' ? dayAlerts : data.alerts;
  const openCount = dayAlerts.filter((a) => a.severity === 'critical' || a.severity === 'serious').length;

  const flightForMap = useMemo(() => {
    if (!showFlight) return undefined;
    const of = data.flights.filter((f) => f.day === day && f.paddockIds.length);
    return of.reduce<(typeof of)[number] | undefined>(
      (best, f) => (best === undefined || Math.abs(f.hour - hour) < Math.abs(best.hour - hour) ? f : best),
      undefined,
    );
  }, [data.flights, day, hour, showFlight]);

  const tick = Math.ceil(data.meta.days / 8);
  const stepsNow = data.stepIndex[day][hour];
  const selectedPd = selectedPaddock
    ? data.paddockDays.find((pd) => pd.day === day && pd.paddockId === selectedPaddock)
    : null;

  const sparkFrom = Math.max(0, day - 13);
  const sparkDetected = countByDay.slice(sparkFrom, day + 1).map((c) => c.detected ?? TOTAL_HEAD);
  const sparkGrazing = behaviourByDay.slice(sparkFrom, day + 1).map((p) => p.values.grazing);

  const unaccountedSeverity: Severity =
    unaccounted == null ? 'warning' : unaccounted >= 10 ? 'critical' : unaccounted >= 4 ? 'serious' : unaccounted > 0 ? 'warning' : 'good';

  /* ---------------- render ---------------- */

  return (
    <>
      <div className="kpi-row">
        <StatTile
          label={t('kpiDetected')}
          value={today.detected == null ? '—' : fmt(detectedToday)}
          unit={t('head')}
          foot={`${t('kpiDetectedFoot', { n: TOTAL_HEAD })}${
            notSurveyed > 0 ? ` · ${notSurveyed} ${lang === 'zh' ? '未覆盖' : 'not surveyed'}` : ''
          }`}
        >
          <Sparkline values={sparkDetected} color={SERIES_VAR(1)} />
        </StatTile>

        <StatTile
          label={t('kpiUnaccounted')}
          value={unaccounted == null ? '—' : fmt(unaccounted)}
          unit={t('head')}
          badge={
            <StatusBadge severity={unaccountedSeverity}>
              {unaccounted == null
                ? t('aborted')
                : unaccounted === 0
                  ? lang === 'zh'
                    ? '全部清点'
                    : 'all accounted'
                  : `${((unaccounted / Math.max(1, today.surveyed ?? 1)) * 100).toFixed(1)}%`}
            </StatusBadge>
          }
          foot={today.confidence ? `${today.confidence.toFixed(1)}% ${t('confidence').toLowerCase()}` : undefined}
        />

        <StatTile
          label={t('kpiGrazing')}
          value={grazingToday.toFixed(1)}
          unit={t('hours')}
          foot={t('perHead')}
        >
          <Sparkline values={sparkGrazing} color={SERIES_VAR(3)} />
        </StatTile>

        <StatTile
          label={t('kpiDistance')}
          value={distanceToday.toFixed(1)}
          unit={t('km')}
          foot={t('perHead')}
        />

        <StatTile
          label={t('kpiHealth')}
          value={Math.round(healthToday)}
          unit="/ 100"
          badge={
            <StatusBadge
              severity={
                dayAlerts.some((a) => a.severity === 'critical')
                  ? 'critical'
                  : dayAlerts.some((a) => a.severity === 'serious')
                    ? 'serious'
                    : dayAlerts.length
                      ? 'warning'
                      : 'good'
              }
            >
              {openCount} {t('kpiOpenAlerts').toLowerCase()}
            </StatusBadge>
          }
          foot={t('ranchWide')}
        />
      </div>

      <div className="ops-grid">
        <Card
          title={t('mapTitle')}
          sub={t('mapSub')}
          flush
          actions={
            <>
              <Segmented<MapLayer>
                ariaLabel={t('mapTitle')}
                value={layer}
                onChange={setLayer}
                options={[
                  { value: 'pressure', label: t('layerPressure') },
                  { value: 'biomass', label: t('layerBiomass') },
                  { value: 'utilisation', label: t('layerUtilisation') },
                  { value: 'rest', label: t('layerRest') },
                  { value: 'none', label: t('layerNone') },
                ]}
              />
              <button
                type="button"
                className="ghost-btn"
                aria-pressed={showTrails}
                onClick={() => setShowTrails(!showTrails)}
              >
                {t('showTrails')}
              </button>
              <button
                type="button"
                className="ghost-btn"
                aria-pressed={showFlight}
                onClick={() => setShowFlight(!showFlight)}
              >
                {t('showFlight')}
              </button>
            </>
          }
        >
          <RanchMap
            data={data}
            day={day}
            hour={hour}
            layer={layer}
            showTrails={showTrails}
            flight={flightForMap}
            selectedPaddock={selectedPaddock}
            onSelectPaddock={setSelectedPaddock}
            selectedHerd={selectedHerd}
            onSelectHerd={setSelectedHerd}
          />
          <div style={{ padding: '10px 8px 2px' }}>
            <Timeline
              day={day}
              hour={hour}
              days={data.meta.days}
              playing={playing}
              weather={data.weather[day]}
              onDay={onDay}
              onHour={onHour}
              onPlaying={onPlaying}
            />
          </div>
          <div style={{ padding: '6px 8px 0' }}>
            <Legend
              items={data.herds.map((h) => ({
                key: h.id,
                label: `${b(h.name)} · ${h.head}`,
                color: SERIES_VAR(Number(h.color.slice(1))),
              }))}
              hidden={new Set(selectedHerd ? data.herds.filter((h) => h.id !== selectedHerd).map((h) => h.id) : [])}
              onToggle={(k) => setSelectedHerd(selectedHerd === k ? null : k)}
            />
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card
            title={t('alerts')}
            sub={t('alertsSub')}
            flush
            actions={
              <Segmented<'day' | 'season'>
                value={alertScope}
                onChange={setAlertScope}
                options={[
                  { value: 'day', label: t('selectedDay') },
                  { value: 'season', label: t('allDays') },
                ]}
              />
            }
          >
            <AlertList alerts={shownAlerts} data={data} onPickDay={onDay} />
          </Card>

          {selectedPaddock && selectedPd ? (
            <Card
              title={`${paddockById.get(selectedPaddock)!.code} · ${b(paddockById.get(selectedPaddock)!.name)}`}
              sub={t(
                paddockById.get(selectedPaddock)!.soil === 'meadow'
                  ? 'soilMeadow'
                  : paddockById.get(selectedPaddock)!.soil === 'typical'
                    ? 'soilTypical'
                    : 'soilSandy',
              )}
              actions={
                <button type="button" className="ghost-btn" onClick={() => setSelectedPaddock(null)}>
                  ✕
                </button>
              }
            >
              <dl className="kv">
                <dt>{t('hectares')}</dt>
                <dd>{fmt(paddockById.get(selectedPaddock)!.areaHa)}</dd>
                <dt>{t('biomass')}</dt>
                <dd>{fmt(selectedPd.biomass)} kg/ha</dd>
                <dt>{t('ndvi')}</dt>
                <dd>{selectedPd.ndvi.toFixed(2)}</dd>
                <dt>{t('utilisation')}</dt>
                <dd>{Math.round(selectedPd.utilization * 100)}%</dd>
                <dt>{t('restDays')}</dt>
                <dd>{selectedPd.restDays}</dd>
                <dt>{t('capacity')}</dt>
                <dd>{paddockById.get(selectedPaddock)!.carryingCapacityAuHa.toFixed(2)} AU/ha</dd>
              </dl>
              <div style={{ margin: '10px 0 4px' }}>
                <Meter
                  value={selectedPd.utilization}
                  target={1}
                  color={STATUS_VAR[utilisationSeverity(selectedPd.utilization)]}
                />
              </div>
              <div className="note">
                {lang === 'zh'
                  ? '刻度线为该草场牧季可安全利用的牧草总量。'
                  : 'The tick is the paddock’s full season forage allowance.'}
              </div>
              <LineChart
                height={150}
                xTickEvery={tick}
                points={data.paddockDays
                  .filter((pd) => pd.paddockId === selectedPaddock)
                  .map((pd) => ({ label: String(pd.day + 1), values: { biomass: pd.biomass } }))}
                series={[{ key: 'biomass', label: `${t('biomass')} kg/ha`, color: SERIES_VAR(1), area: true }]}
                yFormat={(v) => fmt(v)}
              />
              <Legend items={[{ key: 'b', label: `${t('biomass')} (kg DM/ha)`, color: SERIES_VAR(1) }]} shape="line" />
            </Card>
          ) : null}

          <Card
            title={t('navDrone')}
            sub={`${t('selectedDay')} · ${data.weather[day].date}`}
            flush
          >
            <div className="table-scroll" style={{ maxHeight: 200 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>{t('flightId')}</th>
                    <th>{t('status')}</th>
                    <th>{t('coverage')}</th>
                    <th>{t('detected')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.flights
                    .filter((f) => f.day === day)
                    .map((f) => {
                      const det = f.detections.reduce((a, d) => a + d.detected, 0);
                      const exp = f.detections.reduce((a, d) => a + d.expected, 0);
                      return (
                        <tr key={f.id}>
                          <td className="strong">
                            {f.id} · {String(f.hour).padStart(2, '0')}:00
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <StatusBadge
                              severity={
                                f.status === 'complete'
                                  ? 'good'
                                  : f.status === 'partial'
                                    ? 'warning'
                                    : 'critical'
                              }
                            >
                              {t(f.status)}
                            </StatusBadge>
                          </td>
                          <td>{f.coverageHa ? `${fmt(f.coverageHa)} ${t('hectares')}` : '—'}</td>
                          <td>{exp ? `${det} / ${exp}` : '—'}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Card>

          {!selectedPaddock && (
            <Card title={t('herds')} sub={t('herdsSub')} flush>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{t('herds')}</th>
                      <th>{t('head')}</th>
                      <th>{t('paddock')}</th>
                      <th>{t('state')}</th>
                      <th>{t('km')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.herds.map((h) => {
                      const step = stepsNow.find((s) => s.herdId === h.id);
                      const hd = data.herdDays.find((x) => x.day === day && x.herdId === h.id);
                      const selected = selectedHerd === h.id;
                      return (
                        <tr
                          key={h.id}
                          onClick={() => setSelectedHerd(selected ? null : h.id)}
                          style={{
                            cursor: 'pointer',
                            background: selected ? 'var(--surface-2)' : undefined,
                          }}
                        >
                          <td className="strong">
                            <span
                              className="swatch-inline"
                              style={{ background: SERIES_VAR(Number(h.color.slice(1))) }}
                            />
                            {b(h.name)}
                          </td>
                          <td>{h.head}</td>
                          <td>
                            {step ? paddockById.get(step.paddockId)!.code : '—'}
                            {step?.offPaddock && ' ⚠'}
                          </td>
                          <td>{step ? t(step.state) : '—'}</td>
                          <td>{hd ? hd.distanceKm.toFixed(1) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>

      <div className="grid-2">
        <Card title={t('countTitle')} sub={t('countSub')}>
          <Legend
            shape="line"
            items={[
              { key: 'reg', label: `${t('registered')} ${TOTAL_HEAD}`, color: 'var(--text-muted)' },
              { key: 'srv', label: lang === 'zh' ? '航线覆盖头数' : 'Head inside flown area', color: SERIES_VAR(2) },
              { key: 'det', label: t('detected'), color: SERIES_VAR(1) },
            ]}
          />
          <LineChart
            height={200}
            xTickEvery={tick}
            points={countByDay.map((c) => ({
              label: String(c.day + 1),
              values: { detected: c.detected, surveyed: c.surveyed },
            }))}
            series={[
              {
                key: 'surveyed',
                label: lang === 'zh' ? '航线覆盖头数' : 'Inside flown area',
                color: SERIES_VAR(2),
                dashed: true,
              },
              { key: 'detected', label: t('detected'), color: SERIES_VAR(1), area: true },
            ]}
            refLine={{ value: TOTAL_HEAD, label: `${t('registered')} ${TOTAL_HEAD}` }}
            yFormat={(v) => fmt(v)}
            tipTitle={(p) => `${t('day')} ${p.label}`}
          />
          <div className="note">
            {lang === 'zh'
              ? '两条线之间的差值为漏检或走失牛只；虚线与登记线之间为当日未覆盖的牛只。'
              : 'The gap between the two lines is missed or missing animals; the gap above the dashed line is stock the missions did not fly over.'}
          </div>
        </Card>

        <Card
          title={t('behaviourTitle')}
          sub={`${t('behaviourSub')} · ${lang === 'zh' ? '5 日滑动平均' : '5-day rolling mean'}`}
        >
          <Legend
            items={BEHAVIOURS.map((beh, i) => ({
              key: beh,
              label: t(beh),
              color: SERIES_VAR(i + 1),
            }))}
          />
          <LineChart
            height={200}
            stacked
            xTickEvery={tick}
            points={rollingMean(behaviourByDay, 5)}
            series={BEHAVIOURS.map((beh, i) => ({
              key: beh,
              label: t(beh),
              color: SERIES_VAR(i + 1),
            }))}
            yFormat={(v) => `${v.toFixed(0)}h`}
            valueFormat={(v) => `${v.toFixed(1)} h`}
            tipTitle={(p) => `${t('day')} ${p.label}`}
          />
        </Card>

        <Card
          title={t('distanceTitle')}
          sub={`${t('distanceSub')} · ${lang === 'zh' ? '7 日滑动平均' : '7-day rolling mean'}`}
        >
          <Legend
            shape="line"
            items={data.herds.map((h) => ({
              key: h.id,
              label: b(h.name),
              color: SERIES_VAR(Number(h.color.slice(1))),
            }))}
          />
          <LineChart
            height={200}
            xTickEvery={tick}
            points={distanceByDay}
            series={data.herds.map((h) => ({
              key: h.id,
              label: b(h.name),
              color: SERIES_VAR(Number(h.color.slice(1))),
            }))}
            yFormat={(v) => v.toFixed(1)}
            valueFormat={(v) => `${v.toFixed(2)} km`}
            tipTitle={(p) => `${t('day')} ${p.label}`}
          />
        </Card>

      </div>

      <Card
        title={lang === 'zh' ? '当日牛群明细' : 'Herd detail, selected day'}
        sub={
          lang === 'zh'
            ? '按牛群统计的行为时间、位移与饮水'
            : 'Behaviour time, movement and watering per herd'
        }
        flush
      >
        <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>{t('herds')}</th>
                  <th>{t('grazing')}</th>
                  <th>{t('ruminating')}</th>
                  <th>{t('resting')}</th>
                  <th>{t('travelling')}</th>
                  <th>{t('watering')}</th>
                  <th>{t('km')}</th>
                  <th>{t('spread')}</th>
                  <th>{lang === 'zh' ? '活动范围' : 'Area used'}</th>
                  <th>{t('paddock')}</th>
                </tr>
              </thead>
              <tbody>
                {data.herds.map((h) => {
                  const hd = data.herdDays.find((x) => x.day === day && x.herdId === h.id);
                  if (!hd) return null;
                  return (
                    <tr key={h.id}>
                      <td className="strong">
                        <span
                          className="swatch-inline"
                          style={{ background: SERIES_VAR(Number(h.color.slice(1))) }}
                        />
                        {b(h.name)}
                      </td>
                      <td>{(hd.budget.grazing / 60).toFixed(1)}</td>
                      <td>{(hd.budget.ruminating / 60).toFixed(1)}</td>
                      <td>{(hd.budget.resting / 60).toFixed(1)}</td>
                      <td>{(hd.budget.travelling / 60).toFixed(1)}</td>
                      <td>{(hd.budget.watering / 60).toFixed(1)}</td>
                      <td>{hd.distanceKm.toFixed(1)}</td>
                      <td>{hd.meanSpreadM} m</td>
                      <td>
                        {fmt(hd.areaUsedHa)} {t('hectares')}
                      </td>
                      <td>{paddockById.get(hd.paddockId)!.code}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
      </Card>
    </>
  );
}

function AlertList({
  alerts,
  data,
  onPickDay,
}: {
  alerts: Alert[];
  data: Dataset;
  onPickDay: (d: number) => void;
}) {
  const { t, b } = useUi();
  if (!alerts.length) return <div style={{ padding: '14px 16px' }} className="note">{t('noAlerts')}</div>;
  return (
    <div className="list">
      {alerts.slice(0, 60).map((a) => (
        <button type="button" className="list-row" key={a.id} onClick={() => onPickDay(a.day)}>
          <span className={`rail ${a.severity}`} aria-hidden="true" />
          <span style={{ minWidth: 0, flex: 1 }}>
            <span className="row-title">{b(a.title)}</span>
            <span className="row-detail" style={{ display: 'block' }}>
              {b(a.detail)}
            </span>
            <span className="row-meta">
              <span>{t(a.kind)}</span>
              <span>
                {t('day')} {a.day + 1} · {String(a.hour).padStart(2, '0')}:00
              </span>
              {a.paddockId && <span>{data.paddocks.find((p) => p.id === a.paddockId)?.code}</span>}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
