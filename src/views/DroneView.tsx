import { useMemo, useState } from 'react';
import { useUi } from '../i18n';
import { Card, Legend, Segmented, StatTile, StatusBadge } from '../components/ui';
import { HBarChart, LineChart } from '../components/charts';
import { paddockById, TOTAL_HEAD } from '../data/ranch';
import { detectionRateByDay, monitoringCoverage, surveyCoverageByPaddock } from '../lib/derive';
import { downloadCsv, fmt, SERIES_VAR, STATUS_VAR } from '../lib/format';
import type { Dataset, Flight, Severity } from '../data/types';

const STATUS_SEVERITY: Record<Flight['status'], Severity> = {
  complete: 'good',
  partial: 'warning',
  aborted: 'critical',
};

export function DroneView({ data, day, onDay }: { data: Dataset; day: number; onDay: (d: number) => void }) {
  const { t, b, lang } = useUi();
  const [scope, setScope] = useState<'day' | 'season'>('day');

  const rates = useMemo(() => detectionRateByDay(data), [data]);
  const surveyCoverage = useMemo(() => surveyCoverageByPaddock(data, day), [data, day]);

  const tick = Math.ceil(data.meta.days / 8);
  const dayFlights = data.flights.filter((f) => f.day === day);
  const shown = scope === 'day' ? dayFlights : data.flights;
  const flownSeason = data.flights.filter((f) => f.status !== 'aborted').length;
  const groundedSeason = data.flights.filter((f) => f.status === 'aborted').length;
  const coverageToday = dayFlights.reduce((a, f) => a + f.coverageHa, 0);
  const today = rates[day];
  const seasonImages = data.flights.reduce((a, f) => a + f.images, 0);

  return (
    <>
      <div className="kpi-row">
        <StatTile
          label={t('detectionRate')}
          value={today.rate == null ? '—' : today.rate.toFixed(1)}
          unit="%"
          badge={
            <StatusBadge severity={today.rate == null ? 'warning' : today.rate >= 97 ? 'good' : today.rate >= 94 ? 'warning' : 'serious'}>
              {t('targetLine')}
            </StatusBadge>
          }
          foot={today.confidence ? `${today.confidence.toFixed(1)}% ${t('confidence').toLowerCase()}` : undefined}
        />
        <StatTile label={t('coverage')} value={fmt(coverageToday)} unit={t('hectares')} foot={lang === 'zh' ? '当日巡查' : 'imaged today'} />
        <StatTile
          label={t('sortiesFlown')}
          value={flownSeason}
          unit={lang === 'zh' ? '架次' : 'sorties'}
          foot={`${groundedSeason} ${t('aborted').toLowerCase()} · ${t('seasonToDate')}`}
        />
        <StatTile label={t('images')} value={fmt(seasonImages)} foot={t('seasonToDate')} />
        <StatTile
          label={t('ruleMonitoring')}
          value={(monitoringCoverage(data, day) * 100).toFixed(0)}
          unit="%"
          foot={lang === 'zh' ? '草场-日覆盖率' : 'paddock-days imaged'}
        />
      </div>

      <div className="grid-2">
        <Card title={t('accuracyTitle')} sub={t('accuracySub')}>
          <Legend
            shape="line"
            items={[
              { key: 'rate', label: t('detectionRate'), color: SERIES_VAR(1) },
              { key: 'conf', label: t('confidence'), color: SERIES_VAR(2) },
            ]}
          />
          <LineChart
            height={210}
            xTickEvery={tick}
            points={rates.map((r) => ({
              label: String(r.day + 1),
              values: { rate: r.rate, conf: r.confidence },
            }))}
            series={[
              { key: 'rate', label: t('detectionRate'), color: SERIES_VAR(1) },
              { key: 'conf', label: t('confidence'), color: SERIES_VAR(2), dashed: true },
            ]}
            refLine={{ value: 97, label: t('targetLine') }}
            yFormat={(v) => `${v.toFixed(0)}%`}
            valueFormat={(v) => `${v.toFixed(1)}%`}
            tipTitle={(p) => `${t('day')} ${p.label}`}
          />
          <div className="note">
            {lang === 'zh'
              ? '识别率下降通常对应牛群聚集在树荫或高草处、犊牛卧倒，或航线因大风缩短。'
              : 'Dips line up with bunched herds under shade, calves lying in tall grass, or missions cut short by wind.'}
          </div>
        </Card>

        <Card
          title={lang === 'zh' ? '各草场巡查覆盖' : 'Survey coverage by paddock'}
          sub={
            lang === 'zh'
              ? `牧季前 ${day + 1} 天内被拍摄的天数，色标表示距上次拍摄的间隔`
              : `Days imaged in the first ${day + 1} days of the season; colour shows how stale the last look is`
          }
        >
          <Legend
            items={[
              { key: 'g', label: lang === 'zh' ? '✓ 3 天内' : '✓ within 3 days', color: STATUS_VAR.good },
              { key: 'w', label: lang === 'zh' ? '△ 4–6 天' : '△ 4–6 days', color: STATUS_VAR.warning },
              { key: 'c', label: lang === 'zh' ? '⨯ 7 天以上' : '⨯ 7+ days', color: STATUS_VAR.critical },
            ]}
          />
          <HBarChart
            rowHeight={26}
            labelWidth={150}
            rows={data.paddocks.map((p) => {
              const c = surveyCoverage.get(p.id)!;
              const stale = c.lastSeen ?? 99;
              return {
                key: p.id,
                label: b(p.name),
                value: c.days,
                color:
                  stale <= 3 ? STATUS_VAR.good : stale <= 6 ? STATUS_VAR.warning : STATUS_VAR.critical,
                valueLabel:
                  c.lastSeen == null
                    ? `${c.days} d`
                    : `${c.days} d · ${lang === 'zh' ? `${c.lastSeen} 天前` : `${c.lastSeen}d ago`}`,
              };
            })}
          />
          <div className="note">
            {lang === 'zh'
              ? '清晨清点架次覆盖有牛的草场，傍晚巡查架次轮流拍摄休牧草场，因此休牧草场的复查间隔更长。'
              : 'Dawn sorties fly the paddocks holding stock; the evening sweep cycles through the resting ones, so rested paddocks are revisited less often.'}
          </div>
        </Card>
      </div>

      <Card
        title={t('fleetTitle')}
        sub={t('fleetSub')}
        flush
        actions={
          <>
            <Segmented<'day' | 'season'>
              value={scope}
              onChange={setScope}
              options={[
                { value: 'day', label: t('selectedDay') },
                { value: 'season', label: t('allDays') },
              ]}
            />
            <button
              type="button"
              className="ghost-btn"
              onClick={() =>
                downloadCsv('drone-mission-log.csv', [
                  ['flight', 'date', 'hour', 'status', 'paddocks', 'coverage_ha', 'duration_min', 'frames', 'battery_pct', 'wind_ms', 'temp_c', 'detected', 'expected', 'mean_confidence'],
                  ...data.flights.map((f) => [
                    f.id,
                    data.weather[f.day].date,
                    f.hour,
                    f.status,
                    f.paddockIds.join(' '),
                    f.coverageHa,
                    f.durationMin,
                    f.images,
                    f.batteryPct,
                    f.windMs,
                    f.tempC,
                    f.detections.reduce((a, d) => a + d.detected, 0),
                    f.detections.reduce((a, d) => a + d.expected, 0),
                    f.detections.length
                      ? (f.detections.reduce((a, d) => a + d.confidencePct, 0) / f.detections.length).toFixed(1)
                      : '',
                  ]),
                ])
              }
            >
              {t('exportCsv')}
            </button>
          </>
        }
      >
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('flightId')}</th>
                <th>{t('day')}</th>
                <th>{t('status')}</th>
                <th>{t('paddocks')}</th>
                <th>{t('coverage')}</th>
                <th>{t('duration')}</th>
                <th>{t('images')}</th>
                <th>{t('battery')}</th>
                <th>{t('wind')}</th>
                <th>{t('detected')}</th>
                <th>{t('confidence')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((f) => {
                const detected = f.detections.reduce((a, d) => a + d.detected, 0);
                const expected = f.detections.reduce((a, d) => a + d.expected, 0);
                const conf = f.detections.length
                  ? f.detections.reduce((a, d) => a + d.confidencePct, 0) / f.detections.length
                  : null;
                return (
                  <tr key={f.id} onClick={() => onDay(f.day)} style={{ cursor: 'pointer' }}>
                    <td className="strong">{f.id}</td>
                    <td>
                      {data.weather[f.day].date} · {String(f.hour).padStart(2, '0')}:00
                    </td>
                    <td>
                      <StatusBadge severity={STATUS_SEVERITY[f.status]}>{t(f.status)}</StatusBadge>
                    </td>
                    <td>{f.paddockIds.map((id) => paddockById.get(id)!.code.replace('P0', 'P')).join(' ') || '—'}</td>
                    <td>{f.coverageHa ? fmt(f.coverageHa) : '—'}</td>
                    <td>{f.durationMin ? `${f.durationMin}′` : '—'}</td>
                    <td>{f.images ? fmt(f.images) : '—'}</td>
                    <td>{f.batteryPct ? `${f.batteryPct}%` : '—'}</td>
                    <td>{f.windMs.toFixed(1)}</td>
                    <td className={expected && detected < expected ? '' : 'strong'}>
                      {expected ? `${detected} / ${expected}` : '—'}
                    </td>
                    <td>{conf ? `${conf.toFixed(1)}%` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title={lang === 'zh' ? '当日识别明细' : 'Detections, selected day'}
        sub={lang === 'zh' ? `登记总数 ${TOTAL_HEAD} 头` : `${TOTAL_HEAD} head on the herd book`}
        flush
      >
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('herds')}</th>
                <th>{t('flightId')}</th>
                <th>{t('registered')}</th>
                <th>{t('detected')}</th>
                <th>{t('kpiUnaccounted')}</th>
                <th>{t('confidence')}</th>
                <th>{t('animalWelfare')}</th>
              </tr>
            </thead>
            <tbody>
              {dayFlights.flatMap((f) =>
                f.detections.map((d) => {
                  const herd = data.herds.find((h) => h.id === d.herdId)!;
                  const gap = d.expected - d.detected;
                  return (
                    <tr key={`${f.id}-${d.herdId}`}>
                      <td className="strong">
                        <span
                          className="swatch-inline"
                          style={{ background: SERIES_VAR(Number(herd.color.slice(1))) }}
                        />
                        {b(herd.name)}
                      </td>
                      <td>{f.id}</td>
                      <td>{d.expected}</td>
                      <td>{d.detected}</td>
                      <td
                        style={{
                          color: gap / Math.max(1, d.expected) >= 0.03 ? 'var(--critical)' : undefined,
                        }}
                      >
                        {gap}
                      </td>
                      <td>{d.confidencePct.toFixed(1)}%</td>
                      <td>{d.flagged || '—'}</td>
                    </tr>
                  );
                }),
              )}
              {!dayFlights.some((f) => f.detections.length) && (
                <tr>
                  <td colSpan={7} className="note">
                    {lang === 'zh' ? '当日无识别结果（航班取消）。' : 'No detections on this day — missions were grounded.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
