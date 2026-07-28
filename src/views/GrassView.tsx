import { useMemo, useState } from 'react';
import { useUi } from '../i18n';
import { LineChart, rampColor, useRamp } from '../components/charts';
import { RanchMap } from '../components/RanchMap';
import { Meter } from '../components/ui';
import { paddockById } from '../data/ranch';
import { paddockState, STATE_SEVERITY } from '../lib/status';
import { fmt, SERIES_VAR, STATUS_VAR } from '../lib/format';
import type { Dataset } from '../data/types';

export function GrassView({ data, day }: { data: Dataset; day: number }) {
  const { t, b } = useUi();
  const ramp = useRamp();
  const [openArea, setOpenArea] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      [...data.paddockDays.filter((pd) => pd.day === day)].sort((a, b2) => b2.ndvi - a.ndvi),
    [data.paddockDays, day],
  );

  const ndviLo = Math.min(...rows.map((r) => r.ndvi));
  const ndviHi = Math.max(...rows.map((r) => r.ndvi));

  const trend = useMemo(
    () =>
      Array.from({ length: data.meta.days }, (_, d) => {
        const dayRows = data.paddockDays.filter((pd) => pd.day === d);
        const area = dayRows.reduce((a, pd) => a + paddockById.get(pd.paddockId)!.areaHa, 0);
        const values: Record<string, number> = {
          all: dayRows.reduce((a, pd) => a + pd.ndvi * paddockById.get(pd.paddockId)!.areaHa, 0) / area,
        };
        if (openArea) {
          values.one = dayRows.find((pd) => pd.paddockId === openArea)?.ndvi ?? 0;
        }
        return { label: String(d + 1), values };
      }),
    [data.paddockDays, data.meta.days, openArea],
  );

  return (
    <>
      <section className="card big-card">
        <h2 className="big-title">{t('grassPageTitle')}</h2>
        <p className="big-sub">{t('grassPageSub')}</p>
        <RanchMap
          data={data}
          day={day}
          hour={8}
          layer="status"
          showTrails={false}
          minimal
          selectedPaddock={openArea}
          onSelectPaddock={setOpenArea}
          selectedHerd={null}
          onSelectHerd={() => {}}
        />
      </section>

      <section className="card big-card">
        <h2 className="big-title">{t('greenness')}</h2>
        <p className="big-sub">{t('greennessSub')}</p>
        <div className="grass-grid">
          {rows.map((pd) => {
            const p = paddockById.get(pd.paddockId)!;
            const state = paddockState(pd);
            const open = openArea === p.id;
            return (
              <button
                type="button"
                key={p.id}
                className={`grass-tile${open ? ' open' : ''}`}
                onClick={() => setOpenArea(open ? null : p.id)}
              >
                <span className="grass-tile-head">
                  <span className="grass-name">{b(p.name)}</span>
                  <span
                    className="grass-ndvi"
                    style={{
                      background: rampColor(
                        ramp,
                        (pd.ndvi - ndviLo) / Math.max(0.02, ndviHi - ndviLo),
                      ),
                    }}
                  >
                    {pd.ndvi.toFixed(2)}
                  </span>
                </span>
                <span className="grass-bar-label">
                  {t('grassUsed')} <b>{Math.round(pd.utilization * 100)}%</b>
                </span>
                <Meter
                  value={Math.min(1, pd.utilization)}
                  target={1}
                  color={STATUS_VAR[STATE_SEVERITY[state]]}
                />
                <span className="grass-bar-label">
                  {t('grassStock')} <b>{fmt(pd.biomass)} kg/ha</b>
                </span>
                <span className={`big-herd-tag ${state === 'outOfGrass' ? 'bad' : state === 'watch' ? 'unsure' : 'good'}`}>
                  {t(`state_${state}` as 'state_ok')}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card big-card">
        <h2 className="big-title">{t('greennessTrend')}</h2>
        <div className="legend">
          <span className="legend-item">
            <span className="legend-swatch line" style={{ background: SERIES_VAR(1) }} />
            {t('ranchWide')}
          </span>
          {openArea && (
            <span className="legend-item">
              <span className="legend-swatch line" style={{ background: SERIES_VAR(2) }} />
              {b(paddockById.get(openArea)!.name)}
            </span>
          )}
        </div>
        <LineChart
          height={190}
          xTickEvery={Math.ceil(data.meta.days / 8)}
          points={trend}
          series={[
            { key: 'all', label: t('ranchWide'), color: SERIES_VAR(1), area: !openArea },
            ...(openArea
              ? [{ key: 'one', label: b(paddockById.get(openArea)!.name), color: SERIES_VAR(2) }]
              : []),
          ]}
          yFormat={(v) => v.toFixed(2)}
          tipTitle={(p) => `${t('day')} ${p.label}`}
        />
      </section>
    </>
  );
}
