import { useMemo, useState } from 'react';
import { useUi } from '../i18n';
import { Card, Legend, Segmented, StatTile, StatusBadge } from '../components/ui';
import { BarChart, HBarChart, HeatGrid, LineChart, rampColor, useDiverging, useRamp } from '../components/charts';
import { paddockById } from '../data/ranch';
import { meanStockingByPaddock } from '../lib/derive';
import { downloadCsv, fmt, healthSeverity, SERIES_VAR, STATUS_VAR, utilisationSeverity } from '../lib/format';
import type { Dataset } from '../data/types';

type Metric = 'utilisation' | 'biomass' | 'ndvi' | 'rest';

export function GrasslandView({ data, day, onDay }: { data: Dataset; day: number; onDay: (d: number) => void }) {
  const { t, b, lang } = useUi();
  const ramp = useRamp();
  const diverging = useDiverging();
  const [metric, setMetric] = useState<Metric>('utilisation');

  const dayRows = useMemo(
    () => data.paddockDays.filter((pd) => pd.day === day),
    [data.paddockDays, day],
  );

  const meanStocking = useMemo(() => meanStockingByPaddock(data, day), [data, day]);

  const ranchMeans = useMemo(
    () =>
      Array.from({ length: data.meta.days }, (_, d) => {
        const rows = data.paddockDays.filter((pd) => pd.day === d);
        const area = rows.reduce((a, pd) => a + paddockById.get(pd.paddockId)!.areaHa, 0);
        const wmean = (pick: (r: (typeof rows)[number]) => number) =>
          rows.reduce((a, pd) => a + pick(pd) * paddockById.get(pd.paddockId)!.areaHa, 0) / Math.max(1, area);
        return {
          label: String(d + 1),
          values: {
            biomass: wmean((r) => r.biomass),
            ndvi: wmean((r) => r.ndvi),
            health: wmean((r) => r.healthIndex),
          },
        };
      }),
    [data.paddockDays, data.meta.days],
  );

  const rainSeries = data.weather.map((w) => ({ label: String(w.day + 1), values: { rain: w.rainMm } }));

  const totalArea = data.paddocks.reduce((a, p) => a + p.areaHa, 0);
  const meanBiomass = ranchMeans[day].values.biomass;
  const meanHealth = ranchMeans[day].values.health;
  const pressuredHa = dayRows
    .filter((pd) => pd.utilization > 0.85)
    .reduce((a, pd) => a + paddockById.get(pd.paddockId)!.areaHa, 0);
  const restedHa = dayRows
    .filter((pd) => pd.stockingAuHa === 0)
    .reduce((a, pd) => a + paddockById.get(pd.paddockId)!.areaHa, 0);

  const metricValue = (paddockId: string, d: number) => {
    const pd = data.paddockDays.find((x) => x.paddockId === paddockId && x.day === d);
    if (!pd) return null;
    if (metric === 'utilisation') return pd.utilization;
    if (metric === 'biomass') return pd.biomass / paddockById.get(paddockId)!.biomassCeiling;
    if (metric === 'ndvi') return pd.ndvi;
    return pd.restDays;
  };

  const metricColor = (v: number) => {
    if (metric === 'utilisation') return diverging(1 - v);
    if (metric === 'rest') return rampColor(ramp, Math.min(1, v / 30));
    if (metric === 'ndvi') return rampColor(ramp, Math.min(1, v / 0.85));
    return rampColor(ramp, v);
  };

  const metricFormat = (v: number) => {
    if (metric === 'utilisation') return `${Math.round(v * 100)}%`;
    if (metric === 'rest') return `${v} d`;
    if (metric === 'ndvi') return v.toFixed(2);
    return `${Math.round(v * 100)}% ${lang === 'zh' ? '峰值' : 'of peak'}`;
  };

  const tick = Math.ceil(data.meta.days / 8);
  const rotationRows = data.paddocks.map((p) => ({ key: p.id, label: p.code }));
  const dayCols = Array.from({ length: data.meta.days }, (_, d) => ({ key: String(d), label: String(d + 1) }));

  return (
    <>
      <div className="kpi-row">
        <StatTile
          label={t('kpiBiomass')}
          value={fmt(meanBiomass)}
          unit="kg DM/ha"
          foot={t('ranchWide')}
        />
        <StatTile
          label={t('kpiHealth')}
          value={Math.round(meanHealth)}
          unit="/ 100"
          badge={<StatusBadge severity={healthSeverity(meanHealth)}>{t('healthTitle')}</StatusBadge>}
        />
        <StatTile
          label={t('degradedTitle')}
          value={fmt(pressuredHa)}
          unit={t('hectares')}
          foot={`${((pressuredHa / totalArea) * 100).toFixed(0)}% ${lang === 'zh' ? '全场面积' : 'of ranch'}`}
        />
        <StatTile
          label={t('restDays')}
          value={fmt(restedHa)}
          unit={t('hectares')}
          foot={lang === 'zh' ? '当日休牧面积' : 'resting today'}
        />
        <StatTile
          label={t('rainfall')}
          value={fmt(data.weather.slice(0, day + 1).reduce((a, w) => a + w.rainMm, 0), 1)}
          unit="mm"
          foot={t('seasonToDate')}
        />
      </div>

      <Card
        title={t('grassTitle')}
        sub={t('grassSub')}
        flush
        actions={
          <button
            type="button"
            className="ghost-btn"
            onClick={() =>
              downloadCsv(`paddock-condition-day-${day + 1}.csv`, [
                ['paddock', 'name', 'area_ha', 'soil', 'biomass_kg_ha', 'ndvi', 'utilisation', 'rest_days', 'stocking_au_ha', 'capacity_au_ha', 'health_index'],
                ...dayRows.map((pd) => {
                  const p = paddockById.get(pd.paddockId)!;
                  return [
                    p.code,
                    p.name.en,
                    p.areaHa,
                    p.soil,
                    pd.biomass,
                    pd.ndvi,
                    pd.utilization,
                    pd.restDays,
                    pd.stockingAuHa,
                    p.carryingCapacityAuHa,
                    pd.healthIndex,
                  ];
                }),
              ])
            }
          >
            {t('exportCsv')}
          </button>
        }
      >
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('paddock')}</th>
                <th>{t('hectares')}</th>
                <th>{t('biomass')}</th>
                <th>{t('ndvi')}</th>
                <th>{t('utilisation')}</th>
                <th>{t('restDays')}</th>
                <th>{t('stocking')}</th>
                <th>{lang === 'zh' ? '牧季均值' : 'season mean'}</th>
                <th>{t('capacity')}</th>
                <th>{t('kpiHealth')}</th>
              </tr>
            </thead>
            <tbody>
              {dayRows.map((pd) => {
                const p = paddockById.get(pd.paddockId)!;
                const seasonMean = meanStocking.get(p.id) ?? 0;
                const over = seasonMean > p.carryingCapacityAuHa;
                return (
                  <tr key={pd.paddockId}>
                    <td className="strong">
                      {b(p.name)}
                    </td>
                    <td>{fmt(p.areaHa)}</td>
                    <td>{fmt(pd.biomass)}</td>
                    <td>{pd.ndvi.toFixed(2)}</td>
                    <td style={{ color: STATUS_VAR[utilisationSeverity(pd.utilization)] }}>
                      {Math.round(pd.utilization * 100)}%
                    </td>
                    <td>{pd.restDays}</td>
                    <td>{pd.stockingAuHa > 0 ? pd.stockingAuHa.toFixed(2) : '—'}</td>
                    <td style={{ color: over ? 'var(--critical)' : undefined }}>
                      {seasonMean.toFixed(3)}
                      {over ? ' ⨯' : ''}
                    </td>
                    <td>{p.carryingCapacityAuHa.toFixed(3)}</td>
                    <td>
                      <StatusBadge severity={healthSeverity(pd.healthIndex)}>{pd.healthIndex}</StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid-2">
        <Card title={t('biomassTrendTitle')} sub={t('biomassTrendSub')}>
          <Legend shape="line" items={[{ key: 'b', label: `${t('biomass')} (kg DM/ha)`, color: SERIES_VAR(1) }]} />
          <LineChart
            height={170}
            xTickEvery={tick}
            points={ranchMeans.map((p) => ({ label: p.label, values: { biomass: p.values.biomass } }))}
            series={[{ key: 'biomass', label: t('biomass'), color: SERIES_VAR(1), area: true }]}
            yFormat={(v) => fmt(v)}
            tipTitle={(p) => `${t('day')} ${p.label}`}
          />
          <Legend items={[{ key: 'r', label: `${t('rainfall')} (mm)`, color: SERIES_VAR(2) }]} />
          <BarChart
            height={130}
            xTickEvery={tick}
            points={rainSeries}
            series={[{ key: 'rain', label: t('rainfall'), color: SERIES_VAR(2) }]}
            yFormat={(v) => v.toFixed(0)}
            valueFormat={(v) => `${v.toFixed(1)} mm`}
            tipTitle={(p) => `${t('day')} ${p.label}`}
          />
        </Card>

        <Card
          title={t('stockingTitle')}
          sub={
            lang === 'zh'
              ? '牧季累计折算的每公顷载畜量（含休牧期），刻度为核定承载力'
              : 'Season-to-date mean stocking per hectare (rest days included) against approved capacity'
          }
        >
          <Legend
            items={[
              { key: 's', label: t('stocking'), color: SERIES_VAR(1) },
              { key: 'c', label: `${t('capacity')} (▏)`, color: 'var(--text-primary)' },
            ]}
          />
          <HBarChart
            rowHeight={28}
            labelWidth={150}
            rows={data.paddocks.map((p) => {
              const v = meanStocking.get(p.id) ?? 0;
              const over = v > p.carryingCapacityAuHa;
              return {
                key: p.id,
                label: b(p.name),
                value: v,
                target: p.carryingCapacityAuHa,
                color: over ? 'var(--critical)' : SERIES_VAR(1),
                valueLabel: `${v.toFixed(3)} AU/ha`,
                targetLabel: `${t('capacity')} ${p.carryingCapacityAuHa.toFixed(3)}`,
              };
            })}
          />
          <div className="note">
            {lang === 'zh'
              ? '刻度为该草场核定承载力。轮牧期间瞬时载畜量远高于此值，因此以牧季均值衡量压力。'
              : 'Ticks mark approved capacity. Instantaneous stocking during a grazing period is far higher, so pressure is judged on the season mean.'}
          </div>
        </Card>
      </div>

      <Card
        title={t('heatTitle')}
        sub={t('heatSub')}
        actions={
          <Segmented<Metric>
            value={metric}
            onChange={setMetric}
            options={[
              { value: 'utilisation', label: t('utilisation') },
              { value: 'biomass', label: t('biomass') },
              { value: 'ndvi', label: t('ndvi') },
              { value: 'rest', label: t('restDays') },
            ]}
          />
        }
      >
        <HeatGrid
          rows={rotationRows}
          cols={dayCols}
          valueAt={(rowKey, colKey) => metricValue(rowKey, Number(colKey))}
          colorAt={metricColor}
          format={metricFormat}
          onCell={(_r, c) => onDay(Number(c))}
          cellH={19}
          colTickEvery={tick}
        />
        <div className="legend">
          <span className="legend-item">
            {metric === 'utilisation' ? (
              <>
                {t('overUsed')}
                <span
                  style={{
                    width: 110,
                    height: 8,
                    borderRadius: 4,
                    background: `linear-gradient(90deg, ${diverging(-1)}, ${diverging(0)}, ${diverging(1)})`,
                  }}
                />
                {t('underUsed')}
              </>
            ) : (
              <>
                {t('legendLow')}
                <span
                  style={{
                    width: 110,
                    height: 8,
                    borderRadius: 4,
                    background: `linear-gradient(90deg, ${rampColor(ramp, 0)}, ${rampColor(ramp, 0.5)}, ${rampColor(ramp, 1)})`,
                  }}
                />
                {t('legendHigh')}
              </>
            )}
          </span>
          <span className="legend-item note">
            {lang === 'zh' ? '点击任意格跳到该日期' : 'Click any cell to jump to that day'}
          </span>
        </div>
      </Card>

      <Card title={t('rotationTitle')} sub={t('rotationSub')}>
        <Legend
          items={data.herds.map((h) => ({
            key: h.id,
            label: b(h.name),
            color: SERIES_VAR(Number(h.color.slice(1))),
          }))}
        />
        <HeatGrid
          rows={rotationRows}
          cols={dayCols}
          cellH={19}
          colTickEvery={tick}
          valueAt={(rowKey, colKey) => {
            const hd = data.herdDays.find((x) => x.day === Number(colKey) && x.paddockId === rowKey);
            return hd ? data.herds.findIndex((h) => h.id === hd.herdId) : null;
          }}
          colorAt={(v) => SERIES_VAR(v + 1)}
          format={(v) => b(data.herds[v].name)}
          onCell={(_r, c) => onDay(Number(c))}
        />
        <div className="note">
          {lang === 'zh'
            ? '空白表示该草场当日休牧。休牧期不足 25 天会触发预警。'
            : 'Blank cells are rest days. Re-grazing inside 25 rest days raises an alert.'}
        </div>
      </Card>
    </>
  );
}
