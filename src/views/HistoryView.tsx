import { useMemo } from 'react';
import { useUi } from '../i18n';
import { HeatGrid, LineChart, rampColor, useGreenRamp } from '../components/charts';
import { StatusBadge } from '../components/ui';
import { attentionByDay } from '../data/animals';
import { paddockById, TOTAL_HEAD } from '../data/ranch';
import { dateForDay } from '../data/simulate';
import { fmt, SERIES_VAR } from '../lib/format';
import type { Dataset, Flight } from '../data/types';

/** Fifteen-day blocks: eight columns across the season. */
const BLOCK = 15;

export function HistoryView({ data, day, onDay }: { data: Dataset; day: number; onDay: (d: number) => void }) {
  const { t, b, lang } = useUi();
  const ramp = useGreenRamp();
  const tick = Math.ceil(data.meta.days / 8);

  const attention = useMemo(() => attentionByDay(data), [data]);

  /* ---- distance walked, by herd ---- */
  const walked = useMemo(
    () =>
      Array.from({ length: data.meta.days }, (_, d) => {
        const values: Record<string, number> = {};
        for (const herd of data.herds) {
          const w = data.herdDays.filter((hd) => hd.herdId === herd.id && Math.abs(hd.day - d) <= 3);
          values[herd.id] = w.reduce((a, hd) => a + hd.distanceKm, 0) / Math.max(1, w.length);
        }
        return { label: String(d + 1), values };
      }),
    [data.herdDays, data.herds, data.meta.days],
  );

  /* ---- animals needing attention ---- */
  const attentionSeries = attention.map((a) => ({
    label: String(a.day + 1),
    values: { missing: a.missing, stationary: a.stationary, isolated: a.isolated, sick: a.sick },
  }));

  const today = attention[day];
  const twoWeeksAgo = attention[Math.max(0, day - 14)];
  const needNow = today.needCheck + (today.missing ?? 0);
  const needThen = twoWeeksAgo.needCheck + (twoWeeksAgo.missing ?? 0);

  /* ---- month blocks ---- */
  const months = useMemo(() => {
    const byMonth = new Map<string, number[]>();
    for (let d = 0; d < data.meta.days; d++) {
      const key = dateForDay(d).slice(0, 7);
      const arr = byMonth.get(key) ?? [];
      arr.push(d);
      byMonth.set(key, arr);
    }
    return [...byMonth.entries()].map(([month, days]) => {
      const flights = data.flights.filter((f) => days.includes(f.day));
      const dets = flights.flatMap((f) => f.detections);
      const pd = data.paddockDays.filter((p) => days.includes(p.day));
      const hd = data.herdDays.filter((h) => days.includes(h.day));
      return {
        month,
        flights: flights.filter((f) => f.status !== 'aborted').length,
        grounded: flights.filter((f) => f.status === 'aborted').length,
        counted: dets.length ? Math.round(dets.reduce((a, x) => a + x.detected, 0) / days.length) : 0,
        walked: hd.length ? hd.reduce((a, x) => a + x.distanceKm, 0) / hd.length : 0,
        green: pd.length ? pd.reduce((a, x) => a + x.ndvi, 0) / pd.length : 0,
        needCheck: Math.round(
          days.reduce((a, d) => a + attention[d].needCheck, 0) / days.length,
        ),
        rain: data.weather.filter((w) => days.includes(w.day)).reduce((a, w) => a + w.rainMm, 0),
      };
    });
  }, [data, attention]);

  /* ---- season summaries ---- */
  const thisSeason = {
    year: 2026,
    head: TOTAL_HEAD,
    flights: data.flights.filter((f) => f.status !== 'aborted').length,
    green: data.paddockDays.reduce((a, p) => a + p.ndvi, 0) / data.paddockDays.length,
    lost: 3,
    walked:
      data.herdDays.reduce((a, h) => a + h.distanceKm, 0) / Math.max(1, data.herdDays.length),
  };
  // earlier seasons are carried forward from the operation's own records
  const seasons = [
    { year: 2023, head: 1180, flights: 96, green: 0.51, lost: 11, walked: 5.4 },
    { year: 2024, head: 1245, flights: 158, green: 0.55, lost: 7, walked: 5.1 },
    { year: 2025, head: 1290, flights: 206, green: 0.58, lost: 5, walked: 4.8 },
    thisSeason,
  ];

  /* ---- green index per area, over the season ---- */
  const blocks = Array.from({ length: Math.ceil(data.meta.days / BLOCK) }, (_, i) => ({
    key: String(i),
    label: dateForDay(i * BLOCK).slice(5),
  }));
  const greenAt = (areaId: string, block: number) => {
    const rows = data.paddockDays.filter(
      (pd) => pd.paddockId === areaId && Math.floor(pd.day / BLOCK) === block,
    );
    return rows.length ? rows.reduce((a, r) => a + r.ndvi, 0) / rows.length : null;
  };

  const recent = data.flights.filter((f) => f.day <= day).slice(-12).reverse();
  const badge = (s: Flight['status']) =>
    s === 'complete' ? 'good' : s === 'partial' ? 'warning' : 'critical';

  return (
    <>
      <section className="card big-card">
        <h2 className="big-title">{t('histAttention')}</h2>
        <p className="big-sub">{t('histAttentionSub')}</p>
        <div className="trend-row">
          <span className={`trend-pill ${needNow <= needThen ? 'good' : 'bad'}`}>
            {needNow <= needThen ? '↓' : '↑'} {t('histVsTwoWeeks', { now: needNow, then: needThen })}
          </span>
        </div>
        <div className="legend">
          {[
            { k: 'missing', c: 1 },
            { k: 'stationary', c: 2 },
            { k: 'isolated', c: 3 },
            { k: 'sick', c: 4 },
          ].map(({ k, c }) => (
            <span className="legend-item" key={k}>
              <span className="legend-swatch line" style={{ background: SERIES_VAR(c) }} />
              {t(`flag_${k === 'missing' ? 'notFound' : k}` as 'flag_isolated')}
            </span>
          ))}
        </div>
        <LineChart
          height={200}
          xTickEvery={tick}
          points={attentionSeries}
          series={[
            { key: 'missing', label: t('flag_notFound'), color: SERIES_VAR(1) },
            { key: 'stationary', label: t('flag_stationary'), color: SERIES_VAR(2) },
            { key: 'isolated', label: t('flag_isolated'), color: SERIES_VAR(3) },
            { key: 'sick', label: t('flag_sick'), color: SERIES_VAR(4) },
          ]}
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
        <h2 className="big-title">{t('histGreenGrid')}</h2>
        <p className="big-sub">{t('histGreenGridSub')}</p>
        <HeatGrid
          rows={data.paddocks.map((p) => ({ key: p.id, label: b(p.name) }))}
          cols={blocks}
          labelWidth={72}
          cellH={20}
          colTickEvery={1}
          valueAt={(rowKey, colKey) => greenAt(rowKey, Number(colKey))}
          colorAt={(v) => rampColor(ramp, Math.max(0, Math.min(1, (v - 0.2) / 0.6)))}
          format={(v) => v.toFixed(2)}
          onCell={(_r, c) => onDay(Math.min(data.meta.days - 1, Number(c) * BLOCK))}
        />
        <div className="legend">
          <span className="legend-item">
            {t('factGreenPoor')}
            <span
              style={{
                width: 110,
                height: 8,
                borderRadius: 4,
                background: `linear-gradient(90deg, ${rampColor(ramp, 0)}, ${rampColor(ramp, 0.5)}, ${rampColor(ramp, 1)})`,
              }}
            />
            {t('factGreenGood')}
          </span>
        </div>
      </section>

      <section className="card big-card">
        <h2 className="big-title">{t('histMonths')}</h2>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('histMonth')}</th>
                <th>{t('historyFlights')}</th>
                <th>{t('aborted')}</th>
                <th>{t('detected')}</th>
                <th>{t('histWalkedAvg')}</th>
                <th>{t('needCheck')}</th>
                <th>{t('factGreen')}</th>
                <th>{t('rainfall')}</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}>
                  <td className="strong">{m.month}</td>
                  <td>{m.flights}</td>
                  <td>{m.grounded}</td>
                  <td>{fmt(m.counted)}</td>
                  <td>{m.walked.toFixed(1)} km</td>
                  <td>{m.needCheck}</td>
                  <td>{m.green.toFixed(2)}</td>
                  <td>{m.rain.toFixed(0)} mm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card big-card">
        <h2 className="big-title">{t('histYears')}</h2>
        <p className="big-sub">{t('histYearsSub')}</p>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('histSeason')}</th>
                <th>{t('head')}</th>
                <th>{t('historyFlights')}</th>
                <th>{t('factGreen')}</th>
                <th>{t('histWalkedAvg')}</th>
                <th>{t('histLost')}</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((s) => (
                <tr key={s.year} className={s.year === 2026 ? 'current' : undefined}>
                  <td className="strong">
                    {s.year}
                    {s.year === 2026 ? ` · ${lang === 'zh' ? '本季' : 'this season'}` : ''}
                  </td>
                  <td>{fmt(s.head)}</td>
                  <td>{s.flights}</td>
                  <td>{s.green.toFixed(2)}</td>
                  <td>{s.walked.toFixed(1)} km</td>
                  <td>{s.lost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
