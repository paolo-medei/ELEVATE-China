import { useMemo, useState } from 'react';
import { useUi } from './i18n';
import { buildDataset } from './data/simulate';
import { SimpleView } from './views/SimpleView';
import { OperationsView } from './views/OperationsView';
import { GrasslandView } from './views/GrasslandView';
import { DroneView } from './views/DroneView';
import { GovernanceView } from './views/GovernanceView';
import { RANCH_AREA_HA, TOTAL_HEAD } from './data/ranch';
import { fmt } from './lib/format';

type View = 'ops' | 'grass' | 'drone' | 'gov';
type Mode = 'simple' | 'detailed';

export default function App() {
  const { t, b, lang, setLang, theme, setTheme } = useUi();
  const data = useMemo(() => buildDataset(), []);
  const [mode, setMode] = useState<Mode>('simple');
  const [view, setView] = useState<View>('ops');
  const [day, setDay] = useState(data.meta.days - 1);
  const [hour, setHour] = useState(7);
  const [playing, setPlaying] = useState(false);

  const tabs: { key: View; label: string }[] = [
    { key: 'ops', label: t('navOps') },
    { key: 'grass', label: t('navGrass') },
    { key: 'drone', label: t('navDrone') },
    { key: 'gov', label: t('navGov') },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 7h3.2l1.6-2h6.4l1.6 2H20v10H4V7Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.7" />
            </svg>
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="brand-name">
              {t('appName')} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>· {t('appTagline')}</span>
            </div>
            <div className="brand-sub">
              {b(data.meta.ranch)} · {b(data.meta.region)} · {fmt(RANCH_AREA_HA)} {t('hectares')} · {TOTAL_HEAD}{' '}
              {t('head')}
            </div>
          </div>
        </div>

        <nav className="tabs" role="tablist" aria-label="views">
          <button
            type="button"
            role="tab"
            className="tab"
            aria-selected={mode === 'simple'}
            onClick={() => setMode('simple')}
          >
            {t('modeSimple')}
          </button>
          {mode === 'simple' ? (
            <button
              type="button"
              role="tab"
              className="tab"
              aria-selected={false}
              onClick={() => setMode('detailed')}
            >
              {t('modeDetailed')}
            </button>
          ) : (
            tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                className="tab"
                aria-selected={view === tab.key}
                onClick={() => setView(tab.key)}
              >
                {tab.label}
              </button>
            ))
          )}
        </nav>

        <div className="topbar-right">
          <span className="badge">
            <span className="dot" style={{ background: 'var(--series-4)' }} aria-hidden="true" />
            {t('demoBanner')}
          </span>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
            title="Switch language"
          >
            {t('language')}
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={t('theme')}
            title={t('theme')}
          >
            {theme === 'dark' ? '☾' : '☀'}
          </button>
        </div>
      </header>

      <main className="main">
        {mode === 'simple' && <SimpleView data={data} day={day} onDay={setDay} />}
        {mode === 'detailed' && view === 'ops' && (
          <OperationsView
            data={data}
            day={day}
            hour={hour}
            playing={playing}
            onDay={setDay}
            onHour={setHour}
            onPlaying={setPlaying}
          />
        )}
        {mode === 'detailed' && view === 'grass' && <GrasslandView data={data} day={day} onDay={setDay} />}
        {mode === 'detailed' && view === 'drone' && <DroneView data={data} day={day} onDay={setDay} />}
        {mode === 'detailed' && view === 'gov' && <GovernanceView data={data} day={day} onDay={setDay} />}

        <footer className="footer">
          <span>
            {t('demoBanner')} · {data.meta.startDate} → {data.weather[data.meta.days - 1].date}
          </span>
          <span>
            {lang === 'zh'
              ? '数据为确定性模拟：无人机识别、GPS 轨迹、草场生长与降水模型。'
              : 'Deterministic simulation of drone detections, herd tracks, forage growth and rainfall.'}
          </span>
          <span>
            {lang === 'zh'
              ? '配色通过色盲安全校验，支持深浅两种主题。'
              : 'Palette validated for colour-vision deficiency in both themes.'}
          </span>
        </footer>
      </main>
    </div>
  );
}
