import { useRef, useState } from 'react';
import { useUi } from '../i18n';
import { applyFarm, downloadFarm, resetFarm, usingCustomFarm } from '../data/source';
import { downloadWorkbook, farmFromWorkbook, WorkbookError } from '../data/workbook';

/**
 * Where the data gets changed. Excel is the way in — the spreadsheet is the same database
 * the app runs on, one sheet per topic — with the raw JSON kept behind a fold for anyone
 * who wants it.
 */
export function DataPanel({ onClose }: { onClose: () => void }) {
  const { t } = useUi();
  const excelRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  const loadExcel = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setBusy(true);
    try {
      // applyFarm reloads the page on success, so only a failure ever returns here
      setProblem(applyFarm(await farmFromWorkbook(file)));
    } catch (e) {
      setProblem(e instanceof WorkbookError ? e.message : 'this file is not a readable spreadsheet');
    }
    setBusy(false);
  };

  const loadJson = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    try {
      setProblem(applyFarm(JSON.parse(await file.text())));
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
        <div className="data-panel-state">{usingCustomFarm ? t('dataCustom') : t('dataOriginal')}</div>

        <div className="data-panel-actions">
          <button type="button" className="ghost-btn primary" onClick={downloadWorkbook}>
            <XlIcon /> {t('dataDownloadXl')}
          </button>
          <button
            type="button"
            className="ghost-btn primary"
            onClick={() => excelRef.current?.click()}
            disabled={busy}
          >
            <XlIcon /> {busy ? t('dataReading') : t('dataLoadXl')}
          </button>
          <button type="button" className="ghost-btn" onClick={resetFarm} disabled={!usingCustomFarm}>
            ↺ {t('dataReset')}
          </button>
          <input
            ref={excelRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(e) => {
              void loadExcel(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        {problem && <div className="data-panel-error">{t('dataBad', { why: problem })}</div>}

        <p className="data-panel-hint">{t('dataSheets')}</p>

        <details className="data-panel-more" open={advanced} onToggle={(e) => setAdvanced(e.currentTarget.open)}>
          <summary>{t('dataAdvanced')}</summary>
          <div className="data-panel-actions">
            <button type="button" className="ghost-btn" onClick={downloadFarm}>
              ↓ {t('dataDownload')}
            </button>
            <button type="button" className="ghost-btn" onClick={() => jsonRef.current?.click()}>
              ↑ {t('dataLoad')}
            </button>
            <input
              ref={jsonRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                void loadJson(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </details>
      </aside>
    </>
  );
}

/** The green sheet mark, so the Excel buttons read as Excel at a glance. */
const XlIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
    <rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="#1d7044" />
    <path
      d="M5 5l6 6M11 5l-6 6"
      stroke="#fff"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);
