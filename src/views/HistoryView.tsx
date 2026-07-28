import { useMemo } from 'react';
import { useUi } from '../i18n';
import { LineChart } from '../components/charts';
import { StatusBadge } from '../components/ui';
import { paddockById, TOTAL_HEAD } from '../data/ranch';
import { fmt, SERIES_VAR } from '../lib/format';
import type { Dataset, Flight } from '../data/types';

export function HistoryView({ data, day, onDay }: { data: Dataset; day: number; onDay: (d: number) => void }) {
  const { t, b, lang } = useUi();
  const tick = Math.ceil(data.meta.days / 8);

  const counts = useMemo(
    () =>
      Array.from({ length: data.meta.days }, (_, d) => {
        const dets = data.flights.filter((f) => f.day === d).flatMap((f) => f.detections);
        return {
          label: String(d + 1),
          values: { seen: dets.length ? dets.reduce((a, x) => a + x.detected, 0) : null },
        };
      }),
    [data.flights, data.meta.days],
  );

  const walked = useMemo(
    () =>
      Array.from({ length: data.meta.days }, (_, d) => {
        const values: Record<string, number> = {};
        for (const herd of data.herds) {
          const window = data.herdDays.filter(
            (hd) => hd.herdId === herd.id && Math.abs(hd.day - d) <= 3,
          );
          values[herd.id] = window.reduce((a, hd) => a + hd.distanceKm, 0) / Math.max(1, window.length);
        }
        return { label: String(d + 1), values };
      }),
    [data.herdDays, data.herds, data.meta.days],
  );

  const flown = data.flights.filter((f) => f.day <= day && f.status !== 'aborted').length;
  const grounded = data.flights.filter((f) => f.day <= day && f.status === 'aborted').length;
  const shortened = data.flights.filter((f) => f.day <= day && f.status === 'partial').length;
  const recent = data.flights.filter((f) => f.day <= day).slice(-14).reverse();

  const badge = (s: Flight['status']) =>
    s === 'complete' ? 'good' : s === 'partial' ? 'warning' : 'critical';

  return (
    <>
      <section className="card big-card">
        <h2 className="big-title">{t('historyFlights')}</h2>
        <p className="big-sub">{t('historyFlightsSub')}</p>
        <div className="flag-summary">
          <div className="flag-tile good">
            <span className="flag-count">{fmt(flown)}</span>
            <span className="flag-name">{t('complete')}</span>
          </div>
          <div className="flag-tile warning">
            <span className="flag-count">{fmt(shortened)}</span>
            <span className="flag-name">{t('partial')}</span>
          </div>
          <div className="flag-tile critical">
            <span className="flag-count">{fmt(grounded)}</span>
            <span className="flag-name">{t('aborted')}</span>
          </div>
        </div>
      </section>

      <section className="card big-card">
        <h2 className="big-title">{t('historyCounts')}</h2>
        <p className="big-sub">{t('historyCountsSub', { n: fmt(TOTAL_HEAD) })}</p>
        <LineChart
          height={190}
          xTickEvery={tick}
          points={counts}
          series={[{ key: 'seen', label: t('detected'), color: SERIES_VAR(1), area: true }]}
          refLine={{ value: TOTAL_HEAD, label: `${fmt(TOTAL_HEAD)}` }}
          yFormat={(v) => fmt(v)}
          tipTitle={(p) => `${t('day')} ${p.label}`}
        />
      </section>

      <section className="card big-card">
        <h2 className="big-title">{t('historyWalk')}</h2>
        <p className="big-sub">{t('historyWalkSub')}</p>
        <div className="legend">
          {data.herds.map((h) => (
            <span className="legend-item" key={h.id}>
              <span
                className="legend-swatch line"
                style={{ background: SERIES_VAR(Number(h.color.slice(1))) }}
              />
              {b(h.name)}
            </span>
          ))}
        </div>
        <LineChart
          height={190}
          xTickEvery={tick}
          points={walked}
          series={data.herds.map((h) => ({
            key: h.id,
            label: b(h.name),
            color: SERIES_VAR(Number(h.color.slice(1))),
          }))}
          yFormat={(v) => v.toFixed(1)}
          valueFormat={(v) => `${v.toFixed(1)} km`}
          tipTitle={(p) => `${t('day')} ${p.label}`}
        />
      </section>

      <section className="card big-card">
        <h2 className="big-title">{t('historyTable')}</h2>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('day')}</th>
                <th style={{ textAlign: 'left' }}>{t('status')}</th>
                <th>{t('coverage')}</th>
                <th>{t('detected')}</th>
                <th>{t('confidence')}</th>
                <th>{t('wind')}</th>
                <th style={{ textAlign: 'left' }}>{t('paddocks')}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((f) => {
                const det = f.detections.reduce((a, d) => a + d.detected, 0);
                const exp = f.detections.reduce((a, d) => a + d.expected, 0);
                const conf = f.detections.length
                  ? f.detections.reduce((a, d) => a + d.confidencePct, 0) / f.detections.length
                  : null;
                return (
                  <tr key={f.id} onClick={() => onDay(f.day)} style={{ cursor: 'pointer' }}>
                    <td className="strong">
                      {data.weather[f.day].date} · {String(f.hour).padStart(2, '0')}:00
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <StatusBadge severity={badge(f.status)}>{t(f.status)}</StatusBadge>
                    </td>
                    <td>{f.coverageHa ? `${fmt(f.coverageHa)} ${t('hectares')}` : '—'}</td>
                    <td>{exp ? `${det} / ${exp}` : '—'}</td>
                    <td>{conf ? `${conf.toFixed(1)}%` : '—'}</td>
                    <td>{f.windMs.toFixed(1)} m/s</td>
                    <td style={{ textAlign: 'left' }}>
                      {f.paddockIds.length
                        ? f.paddockIds.map((id) => paddockById.get(id)!.code).join(' ')
                        : lang === 'zh'
                          ? '未起飞'
                          : 'did not fly'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
