import { useRef, useState } from 'react';
import { useUi } from '../i18n';
import { applyFarm, downloadFarm, resetFarm, usingCustomFarm } from '../data/source';

/**
 * The database drawer. The app has exactly one input file; this is where a grazier gets a
 * copy of it, puts an edited one back, or returns to the original.
 */
export function DataPanel({ onClose }: { onClose: () => void }) {
  const { t } = useUi();
  const fileRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      // applyFarm reloads the page on success, so only a failure ever returns here
      setProblem(applyFarm(parsed));
    } catch {
      setProblem('not valid JSON');
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="data-panel" role="dialog" aria-label={t('dataTitle')}>
        <header className="data-panel-head">
          <div className="card-title">{t('dataTitle')}</div>
          <button type="button" className="ghost-btn" onClick={onClose}>
            {t('close')}
          </button>
        </header>

        <p className="data-panel-text">{t('dataIntro')}</p>

        <div className="data-panel-state">
          {usingCustomFarm ? t('dataCustom') : t('dataOriginal')}
        </div>

        <div className="data-panel-actions">
          <button type="button" className="ghost-btn" onClick={downloadFarm}>
            ↓ {t('dataDownload')}
          </button>
          <button type="button" className="ghost-btn" onClick={() => fileRef.current?.click()}>
            ↑ {t('dataLoad')}
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={resetFarm}
            disabled={!usingCustomFarm}
          >
            ↺ {t('dataReset')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              void load(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        {problem && <div className="data-panel-error">{t('dataBad', { why: problem })}</div>}

        <p className="data-panel-hint">{t('dataHint')}</p>
      </aside>
    </>
  );
}
