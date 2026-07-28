import { useMemo, useState } from 'react';
import { useUi } from './i18n';
import { buildDataset } from './data/simulate';
import { TodayView } from './views/TodayView';

export default function App() {
  const { t, b, lang, setLang, theme, setTheme } = useUi();
  const data = useMemo(() => buildDataset(), []);
  const [day, setDay] = useState(data.meta.days - 1);

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

        <div className="topbar-right">
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
        <TodayView data={data} day={day} onDay={setDay} />

        <footer className="footer">
          <span>{t('demoBanner')}</span>
        </footer>
      </main>
    </div>
  );
}
