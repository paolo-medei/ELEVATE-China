import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from './i18n';
import { preloadRecords } from './data/records';
import App from './App';
import './styles.css';

// the measurement records are fetched before the first render, because that is when the
// season is built and when every screen asks whether a value was measured or modelled
await preloadRecords();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
