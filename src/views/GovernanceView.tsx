import { useMemo } from 'react';
import { useUi } from '../i18n';
import { Card, Legend, Meter, StatTile, StatusBadge } from '../components/ui';
import { HBarChart, LineChart } from '../components/charts';
import { paddockById, QUOTA_SHEEP_UNITS, SHEEP_UNITS_PER_AU, TOTAL_AU, TOTAL_HEAD } from '../data/ranch';
import { meanStockingByPaddock, monitoringCoverage, pressuredAreaByDay, restCompliance } from '../lib/derive';
import { downloadCsv, fmt, healthSeverity, SERIES_VAR, STATUS_VAR } from '../lib/format';
import type { Dataset, Severity } from '../data/types';

export function GovernanceView({ data, day, onDay }: { data: Dataset; day: number; onDay: (d: number) => void }) {
  const { t, b, lang } = useUi();

  const actualSu = Math.round(TOTAL_AU * SHEEP_UNITS_PER_AU);
  const load = actualSu / QUOTA_SHEEP_UNITS;
  const overloadRate = load - 1;
  const balanceSeverity: Severity = load <= 0.9 ? 'good' : load <= 1 ? 'warning' : load <= 1.15 ? 'serious' : 'critical';

  const meanStocking = useMemo(() => meanStockingByPaddock(data, day), [data, day]);
  const pressured = useMemo(() => pressuredAreaByDay(data), [data]);
  const rest = useMemo(() => restCompliance(data), [data]);
  const monitoring = useMemo(() => monitoringCoverage(data, day), [data, day]);

  const tick = Math.ceil(data.meta.days / 8);
  const dayRows = useMemo(() => data.paddockDays.filter((pd) => pd.day === day), [data.paddockDays, day]);
  const totalArea = data.paddocks.reduce((a, p) => a + p.areaHa, 0);
  const meanHealth =
    dayRows.reduce((a, pd) => a + pd.healthIndex * paddockById.get(pd.paddockId)!.areaHa, 0) / totalArea;

  const overPaddocks = data.paddocks.filter(
    (p) => (meanStocking.get(p.id) ?? 0) > p.carryingCapacityAuHa,
  );

  const restSeverity: Severity = rest.rate >= 0.9 ? 'good' : rest.rate >= 0.7 ? 'warning' : 'serious';
  const monitorSeverity: Severity = monitoring >= 0.8 ? 'good' : monitoring >= 0.6 ? 'warning' : 'serious';

  const rules: { name: string; detail: string; severity: Severity; verdict: string }[] = [
    {
      name: t('ruleBalance'),
      detail:
        lang === 'zh'
          ? `实际 ${fmt(actualSu)} 羊单位 / 核定 ${fmt(QUOTA_SHEEP_UNITS)} 羊单位`
          : `${fmt(actualSu)} of ${fmt(QUOTA_SHEEP_UNITS)} approved sheep units`,
      severity: balanceSeverity,
      verdict: load <= 1 ? t('rulePassed') : t('ruleFailed'),
    },
    {
      name: t('ruleRest'),
      detail:
        lang === 'zh'
          ? `${rest.compliant}/${rest.cycles} 个轮牧周期休牧达到 25 天`
          : `${rest.compliant} of ${rest.cycles} grazing cycles got 25+ rest days`,
      severity: restSeverity,
      verdict: rest.rate >= 0.9 ? t('rulePassed') : rest.rate >= 0.7 ? t('ruleWatch') : t('ruleFailed'),
    },
    {
      name: t('ruleMonitoring'),
      detail:
        lang === 'zh'
          ? `${(monitoring * 100).toFixed(0)}% 的草场-日被无人机覆盖`
          : `${(monitoring * 100).toFixed(0)}% of paddock-days imaged by a mission`,
      severity: monitorSeverity,
      verdict: monitoring >= 0.8 ? t('rulePassed') : monitoring >= 0.6 ? t('ruleWatch') : t('ruleFailed'),
    },
    {
      name: t('degradedTitle'),
      detail:
        lang === 'zh'
          ? `当日 ${fmt(pressured[day])} 公顷已用去 85% 以上的牧草额度`
          : `${fmt(pressured[day])} ha have used more than 85% of their forage allowance`,
      severity: pressured[day] / totalArea > 0.25 ? 'serious' : pressured[day] > 0 ? 'warning' : 'good',
      verdict:
        pressured[day] / totalArea > 0.25 ? t('ruleFailed') : pressured[day] > 0 ? t('ruleWatch') : t('rulePassed'),
    },
  ];

  return (
    <>
      <div className="kpi-row">
        <StatTile
          label={t('actual')}
          value={fmt(actualSu)}
          unit={t('sheepUnits')}
          badge={<StatusBadge severity={balanceSeverity}>{load <= 1 ? t('compliant') : t('overstocked')}</StatusBadge>}
          foot={`${TOTAL_HEAD} ${t('head')} · ${fmt(TOTAL_AU, 0)} AU`}
        />
        <StatTile label={t('quota')} value={fmt(QUOTA_SHEEP_UNITS)} unit={t('sheepUnits')} foot={`${fmt(totalArea)} ${t('hectares')}`} />
        <StatTile
          label={t('overloadRate')}
          value={`${overloadRate > 0 ? '+' : ''}${(overloadRate * 100).toFixed(1)}`}
          unit="%"
          foot={lang === 'zh' ? '全场载畜负荷' : 'ranch-wide load'}
        />
        <StatTile
          label={t('kpiHealth')}
          value={Math.round(meanHealth)}
          unit="/ 100"
          badge={<StatusBadge severity={healthSeverity(meanHealth)}>{t('healthTitle')}</StatusBadge>}
        />
        <StatTile
          label={t('ruleRest')}
          value={(rest.rate * 100).toFixed(0)}
          unit="%"
          badge={<StatusBadge severity={restSeverity}>{`${rest.compliant}/${rest.cycles}`}</StatusBadge>}
        />
      </div>

      <div className="grid-2">
        <Card title={t('govTitle')} sub={t('govSub')}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '4px 0 10px' }}>
            <span style={{ fontSize: 30, fontWeight: 650, letterSpacing: '-0.02em' }}>
              {(load * 100).toFixed(0)}%
            </span>
            <span className="note">
              {lang === 'zh' ? '核定载畜量占用' : 'of the approved quota in use'}
            </span>
            <span style={{ marginLeft: 'auto' }}>
              <StatusBadge severity={balanceSeverity}>{load <= 1 ? t('compliant') : t('overstocked')}</StatusBadge>
            </span>
          </div>
          <Meter value={Math.min(1, load)} target={1} color={STATUS_VAR[balanceSeverity]} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }} className="note">
            <span>
              {t('actual')} {fmt(actualSu)} {t('sheepUnits')}
            </span>
            <span>
              {t('quota')} {fmt(QUOTA_SHEEP_UNITS)}
            </span>
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="card-title">{t('stockingTitle')}</div>
            <div className="card-sub" style={{ marginBottom: 6 }}>
              {lang === 'zh'
                ? '按牧季累计折算的每公顷载畜量（含休牧期），刻度为核定承载力'
                : 'Season-to-date mean stocking per hectare (rest days included); the tick is the approved capacity'}
            </div>
            <Legend
              items={[
                { key: 's', label: t('stocking'), color: SERIES_VAR(1) },
                { key: 'o', label: t('overstocked'), color: STATUS_VAR.critical },
              ]}
            />
            <HBarChart
              rowHeight={26}
              labelWidth={150}
              rows={data.paddocks.map((p) => {
                const v = meanStocking.get(p.id) ?? 0;
                return {
                  key: p.id,
                  label: `${p.code} ${b(p.name)}`,
                  value: v,
                  target: p.carryingCapacityAuHa,
                  color: v > p.carryingCapacityAuHa ? STATUS_VAR.critical : SERIES_VAR(1),
                  valueLabel: `${v.toFixed(3)} AU/ha`,
                  targetLabel: `${t('capacity')} ${p.carryingCapacityAuHa.toFixed(3)}`,
                };
              })}
            />
            <div className="note">
              {overPaddocks.length
                ? lang === 'zh'
                  ? `${overPaddocks.length} 个草场超过核定承载力：${overPaddocks.map((p) => p.code).join('、')}。全场总量虽未超载，仍需调整轮牧以平衡压力。`
                  : `${overPaddocks.length} paddocks sit above their own capacity (${overPaddocks.map((p) => p.code).join(', ')}). The ranch total is inside quota, so the fix is rotation, not destocking.`
                : lang === 'zh'
                  ? '所有草场均在核定承载力以内。'
                  : 'Every paddock is inside its approved capacity.'}
            </div>
          </div>
        </Card>

        <Card title={t('healthTitle')} sub={t('healthSub')}>
          <Legend
            items={[
              { key: 'g', label: `✓ ${t('rulePassed')} ≥70`, color: STATUS_VAR.good },
              { key: 'w', label: `△ ${t('ruleWatch')} 55–69`, color: STATUS_VAR.warning },
              { key: 's', label: `! 40–54`, color: STATUS_VAR.serious },
              { key: 'c', label: `⨯ ${t('ruleFailed')} <40`, color: STATUS_VAR.critical },
            ]}
          />
          <HBarChart
            rowHeight={26}
            labelWidth={150}
            max={100}
            rows={dayRows.map((pd) => {
              const p = paddockById.get(pd.paddockId)!;
              return {
                key: p.id,
                label: `${p.code} ${b(p.name)}`,
                value: pd.healthIndex,
                color: STATUS_VAR[healthSeverity(pd.healthIndex)],
                valueLabel: String(pd.healthIndex),
              };
            })}
          />
          <div style={{ marginTop: 12 }}>
            <div className="card-title">{t('degradedTitle')}</div>
            <div className="card-sub" style={{ marginBottom: 4 }}>
              {t('degradedSub')}
            </div>
            <Legend shape="line" items={[{ key: 'p', label: `${t('degradedTitle')} (${t('hectares')})`, color: SERIES_VAR(2) }]} />
            <LineChart
              height={150}
              xTickEvery={tick}
              points={pressured.map((v, d) => ({ label: String(d + 1), values: { ha: v } }))}
              series={[{ key: 'ha', label: t('degradedTitle'), color: SERIES_VAR(2), area: true }]}
              yFormat={(v) => fmt(v)}
              valueFormat={(v) => `${fmt(v)} ${t('hectares')}`}
              tipTitle={(p) => `${t('day')} ${p.label}`}
            />
          </div>
        </Card>
      </div>

      <Card
        title={t('complianceSummary')}
        sub={`${b(data.meta.ranch)} · ${b(data.meta.region)} · ${data.weather[0].date} → ${data.weather[day].date}`}
        flush
        actions={
          <button
            type="button"
            className="ghost-btn"
            onClick={() =>
              downloadCsv(`grass-livestock-balance-${data.weather[day].date}.csv`, [
                ['section', 'metric', 'value', 'unit', 'status'],
                ['balance', 'approved_quota', QUOTA_SHEEP_UNITS, 'sheep units', ''],
                ['balance', 'actual_stocking', actualSu, 'sheep units', balanceSeverity],
                ['balance', 'load', (load * 100).toFixed(1), '%', balanceSeverity],
                ['rest', 'compliant_cycles', rest.compliant, `of ${rest.cycles}`, restSeverity],
                ['monitoring', 'paddock_day_coverage', (monitoring * 100).toFixed(1), '%', monitorSeverity],
                ['condition', 'mean_health_index', Math.round(meanHealth), '/100', healthSeverity(meanHealth)],
                [],
                ['paddock', 'name', 'area_ha', 'mean_stocking_au_ha', 'capacity_au_ha', 'health_index', 'utilisation'],
                ...dayRows.map((pd) => {
                  const p = paddockById.get(pd.paddockId)!;
                  return [
                    p.code,
                    p.name.en,
                    p.areaHa,
                    (meanStocking.get(p.id) ?? 0).toFixed(4),
                    p.carryingCapacityAuHa,
                    pd.healthIndex,
                    pd.utilization.toFixed(3),
                  ];
                }),
              ])
            }
          >
            {t('exportReport')}
          </button>
        }
      >
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('complianceSummary')}</th>
                <th style={{ textAlign: 'left' }}>{t('status')}</th>
                <th style={{ textAlign: 'left' }}>—</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.name}>
                  <td className="strong">{r.name}</td>
                  <td style={{ textAlign: 'left' }}>
                    <StatusBadge severity={r.severity}>{r.verdict}</StatusBadge>
                  </td>
                  <td style={{ textAlign: 'left' }}>{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '12px 16px' }} className="note">
          {t('govNote')}
        </div>
      </Card>

      <Card
        title={lang === 'zh' ? '违规与预警记录' : 'Enforcement-grade event log'}
        sub={lang === 'zh' ? '可作为核查依据的自动记录' : 'Automatically evidenced events available for verification'}
        flush
      >
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('day')}</th>
                <th style={{ textAlign: 'left' }}>{t('alerts')}</th>
                <th style={{ textAlign: 'left' }}>{t('status')}</th>
                <th style={{ textAlign: 'left' }}>{t('paddock')}</th>
              </tr>
            </thead>
            <tbody>
              {data.alerts
                .filter((a) => a.kind === 'overgrazing' || a.kind === 'restViolation' || a.kind === 'fenceBreach')
                .slice(0, 40)
                .map((a) => (
                  <tr key={a.id} onClick={() => onDay(a.day)} style={{ cursor: 'pointer' }}>
                    <td>{data.weather[a.day].date}</td>
                    <td style={{ textAlign: 'left' }} className="strong">
                      {b(a.title)}
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <StatusBadge severity={a.severity}>{t(a.kind)}</StatusBadge>
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      {a.paddockId ? paddockById.get(a.paddockId)!.code : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
