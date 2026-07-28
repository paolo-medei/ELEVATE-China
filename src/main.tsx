import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from './i18n';
import { preloadRecords } from './data/records';
import App from './App';
import './styles.css';

/*
 * The measurement records are fetched before the first render, because that is when the
 * season is built and when every screen asks whether a value was measured or modelled.
 *
 * Nothing here may stop the app appearing. Stored records are a bonus; if the browser
 * will not hand them over, the app still opens on the season it can generate itself, and
 * anything that does go wrong is put on the screen rather than left as a blank page.
 */
try {
  await preloadRecords();
} catch {
  /* no stored records — the app generates its own season */
}

const root = document.getElementById('root')!;

try {
  createRoot(root).render(
    <StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </StrictMode>,
  );
} catch (e) {
  root.innerHTML =
    '<div style="max-width:34rem;margin:12vh auto;padding:0 1.5rem;font:15px/1.6 system-ui,sans-serif">' +
    "<h1 style='font-size:1.15rem;margin:0 0 .6rem'>Farmers&rsquo; Wingman could not start</h1>" +
    '<p style="margin:0 0 .6rem">Please try reloading the page.</p>' +
    `<pre style="white-space:pre-wrap;font-size:12px;opacity:.7;margin:0">${String(e)}</pre></div>`;
}
