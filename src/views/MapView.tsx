import { useMemo, useState } from 'react';
import { useUi } from '../i18n';
import { RanchMap } from '../components/RanchMap';
import { Segmented } from '../components/ui';
import { cowSeverity, cowSnapshot, elevationAt, FLAG_SEVERITY, type CowFlag, type CowState } from '../data/animals';
import { formatLatLon, pointInPolygon, toLatLon } from '../lib/geo';
import { fmt, SERIES_VAR, STATUS_VAR } from '../lib/format';
import type { Dataset } from '../data/types';

export function MapView({
  data,
  day,
  hour,
  onHour,
}: {
  data: Dataset;
  day: number;
  hour: number;
  onHour: (h: number) => void;
}) {
  const { t, b, lang } = useUi();
  const [basemap, setBasemap] = useState<'satellite' | 'plain'>('satellite');
  const [selectedCow, setSelectedCow] = useState<string | null>(null);
  const [herdFilter, setHerdFilter] = useState<string | null>(null);

  const all = useMemo(() => cowSnapshot(data, day, hour), [data, day, hour]);
  const shown = useMemo(
    () => (herdFilter ? all.filter((c) => c.cow.herdId === herdFilter) : all),
    [all, herdFilter],
  );

  const seen = shown.filter((c) => c.detected).length;
  const high = shown.filter((c) => c.detected && c.confidencePct >= 95).length;
  const mid = shown.filter((c) => c.detected && c.confidencePct >= 85 && c.confidencePct < 95).length;
  const low = shown.filter((c) => c.detected && c.confidencePct < 85).length;

  const selected = selectedCow ? all.find((c) => c.cow.id === selectedCow) ?? null : null;

  // picking one herd zooms the map onto it, so individual animals are actually visible
  const focus = useMemo(() => {
    if (!herdFilter || shown.length === 0) return undefined;
    const xs = shown.map((c) => c.at.x);
    const ys = shown.map((c) => c.at.y);
    const pad = 260;
    return {
      minX: Math.min(...xs) - pad,
      minY: Math.min(...ys) - pad,
      maxX: Math.max(...xs) + pad,
      maxY: Math.max(...ys) + pad,
    };
  }, [herdFilter, shown]);

  return (
    <>
      <section className="card big-card">
        <div className="row-between">
          <h2 className="big-title">{t('mapHerdTitle')}</h2>
          <div className="map-controls">
            <Segmented<'satellite' | 'plain'>
              value={basemap}
              onChange={setBasemap}
              options={[
                { value: 'satellite', label: t('basemapSatellite') },
                { value: 'plain', label: t('basemapPlain') },
              ]}
            />
            <Segmented<string>
              value={herdFilter ?? 'all'}
              onChange={(v) => setHerdFilter(v === 'all' ? null : v)}
              options={[
                { value: 'all', label: t('allHerds') },
                ...data.herds.map((h) => ({ value: h.id, label: b(h.name) })),
              ]}
            />
          </div>
        </div>

        <p className="big-sub">{t('mapHerdSub', { n: fmt(shown.length) })}</p>

        <RanchMap
          data={data}
          day={day}
          hour={hour}
          layer="status"
          showTrails={false}
          minimal
          cowStates={shown}
          basemap={basemap}
          focus={focus}
          selectedCow={selectedCow}
          onSelectCow={setSelectedCow}
          selectedPaddock={null}
          onSelectPaddock={() => {}}
          selectedHerd={null}
          onSelectHerd={() => {}}
        />

        <div className="hour-row">
          <label htmlFor="hour-slider">{t('hour')}</label>
          <input
            id="hour-slider"
            type="range"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => onHour(Number(e.target.value))}
          />
          <span className="hour-readout">{String(hour).padStart(2, '0')}:00</span>
        </div>

        <div className="conf-legend">
          <span>
            <i style={{ background: STATUS_VAR.good }} /> {t('confHigh')} · {fmt(high)}
          </span>
          <span>
            <i style={{ background: STATUS_VAR.warning }} /> {t('confMid')} · {fmt(mid)}
          </span>
          <span>
            <i style={{ background: STATUS_VAR.serious }} /> {t('confLow')} · {fmt(low)}
          </span>
          <span>
            <i style={{ background: STATUS_VAR.critical }} /> {t('confNone')} · {fmt(shown.length - seen)}
          </span>
        </div>
      </section>

      <section className="card big-card">
        <h2 className="big-title">{t('cowDetailTitle')}</h2>
        {selected ? (
          <CowDetail data={data} state={selected} onClose={() => setSelectedCow(null)} />
        ) : (
          <p className="big-sub">{t('cowDetailEmpty')}</p>
        )}

        <div className="cow-chips">
          {all
            .filter((c) => c.flags.length > 0)
            .slice(0, 24)
            .map((c) => (
              <button
                type="button"
                key={c.cow.id}
                className={`cow-chip ${cowSeverity(c)}`}
                onClick={() => setSelectedCow(c.cow.id)}
              >
                <span
                  className="cow-chip-dot"
                  style={{ background: SERIES_VAR(Number(c.cow.herdId.slice(1))) }}
                />
                {lang === 'zh' ? '牛 ' : 'Cow '}
                {c.cow.id}
                <span className="cow-chip-tag">{t(`flag_${c.flags[0]}` as 'flag_isolated')}</span>
              </button>
            ))}
        </div>
      </section>
    </>
  );
}

function CowDetail({
  data,
  state,
  onClose,
}: {
  data: Dataset;
  state: CowState;
  onClose: () => void;
}) {
  const { t, b, lang } = useUi();
  const herd = data.herds.find((h) => h.id === state.cow.herdId)!;
  const ll = toLatLon(state.at, data.meta.origin, data.meta.metresPerDegLat, data.meta.metresPerDegLon);
  const paddock = data.paddocks.find((p) => pointInPolygon(state.at, p.polygon));

  return (
    <div className="cow-detail">
      <div className="cow-detail-head">
        <span
          className="big-herd-dot"
          style={{ background: SERIES_VAR(Number(herd.color.slice(1))) }}
        >
          {herd.id.slice(1)}
        </span>
        <div>
          <div className="cow-id">
            {lang === 'zh' ? '牛 ' : 'Cow '}
            {state.cow.id}
          </div>
          <div className="big-sub">
            {b(herd.name)}
            {paddock ? ` · ${b(paddock.name)}` : ''}
          </div>
        </div>
        <button type="button" className="ghost-btn" onClick={onClose}>
          ✕
        </button>
      </div>

      <dl className="cow-facts">
        <div>
          <dt>{t('cowSeen')}</dt>
          <dd>
            {state.detected
              ? t('cowSeenNow')
              : state.lastSeenDaysAgo >= 60
                ? t('cowSeenLong')
                : state.lastSeenDaysAgo === 1
                  ? t('cowSeenYesterday')
                  : t('cowSeenDaysAgo', { n: state.lastSeenDaysAgo })}
          </dd>
        </div>
        <div>
          <dt>{t('confidence')}</dt>
          <dd>{state.detected ? `${state.confidencePct}%` : '—'}</dd>
        </div>
        <div>
          <dt>{t('cowGps')}</dt>
          <dd className="mono">{formatLatLon(ll)}</dd>
        </div>
        <div>
          <dt>{t('cowHeight')}</dt>
          <dd>{elevationAt(state.at)} m</dd>
        </div>
        <div>
          <dt>{t('cowWalked')}</dt>
          <dd>{state.distanceKm.toFixed(1)} km</dd>
        </div>
        <div>
          <dt>{t('cowStill')}</dt>
          <dd>{state.stillHours.toFixed(1)} h</dd>
        </div>
        <div>
          <dt>{t('cowFromHerd')}</dt>
          <dd>{fmt(state.fromHerdM)} m</dd>
        </div>
      </dl>

      {state.flags.length > 0 && (
        <div className="cow-flags">
          {state.flags.map((f: CowFlag) => (
            <span key={f} className={`big-herd-tag ${FLAG_SEVERITY[f] === 'warning' ? 'unsure' : 'bad'}`}>
              {t(`flag_${f}` as 'flag_isolated')}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

