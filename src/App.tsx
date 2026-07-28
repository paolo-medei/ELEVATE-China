import { useMemo, useState } from 'react';
import { useUi } from './i18n';
import { buildDataset } from './data/simulate';
import { TodayView } from './views/TodayView';
import { AlertsView } from './views/AlertsView';
import { HistoryView } from './views/HistoryView';
import { DataPanel } from './components/DataPanel';
import { usingCustomFarm } from './data/source';

type Section = 'today' | 'alerts' | 'history';

export default function App() {
  const { t, b, lang, setLang, theme, setTheme } = useUi();
  const data = useMemo(() => buildDataset(), []);
  const [day, setDay] = useState(data.meta.days - 1);
  const [section, setSection] = useState<Section>('today');
  const [dataOpen, setDataOpen] = useState(false);

  const sections: { key: Section; label: string }[] = [
    { key: 'today', label: t('navToday') },
    { key: 'alerts', label: t('navAlerts') },
    { key: 'history', label: t('navHistory') },
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
              {t('appName')}
            </div>
            <div className="brand-sub">{b(data.meta.ranch)}</div>
          </div>
        </div>

        <nav className="tabs" role="tablist" aria-label="sections">
          {sections.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              className="tab"
              aria-selected={section === s.key}
              onClick={() => setSection(s.key)}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="topbar-right">
          {usingCustomFarm && <span className="data-badge">{t('dataBadge')}</span>}
          <button
            type="button"
            className="ghost-btn"
            aria-pressed={dataOpen}
            onClick={() => setDataOpen((v) => !v)}
            title={t('dataTitle')}
          >
            {t('dataMenu')}
          </button>
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

      {dataOpen && <DataPanel data={data} onClose={() => setDataOpen(false)} />}

      <main className="main">
        {section === 'today' && <TodayView data={data} day={day} onDay={setDay} />}
        {section === 'alerts' && <AlertsView data={data} day={day} />}
        {section === 'history' && <HistoryView data={data} day={day} onDay={setDay} />}

        <footer className="footer">
          <span>{t('demoBanner')}</span>
        </footer>
      </main>
    </div>
  );
}
