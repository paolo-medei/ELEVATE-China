import { useRef, useState } from 'react';
import { useUi } from '../i18n';
import { applyFarm, downloadFarm, resetFarm, usingCustomFarm } from '../data/source';
import { recordCounts } from '../data/records';
import { downloadWorkbook, farmFromWorkbook, WorkbookError, type Depth } from '../data/workbook';
import { fmt } from '../lib/format';
import type { Dataset } from '../data/types';

/**
 * Where the data gets changed. Excel is the way in — the spreadsheet is the same database
 * the app runs on, one sheet per topic — with the raw JSON kept behind a fold for anyone
 * who wants it.
 */
export function DataPanel({ data, onClose }: { data: Dataset; onClose: () => void }) {
  const { t } = useUi();
  const excelRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<'reading' | 'writing' | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [depth, setDepth] = useState<Depth>('fortnight');

  const head = data.herds.reduce((a, h) => a + h.head, 0);
  const days = depth === 'season' ? data.meta.days : Math.min(14, data.meta.days);
  const cowRows = data.flights.filter(
    (f) => f.status !== 'aborted' && f.day >= data.meta.days - days,
  ).length * head;

  const save = async () => {
    setProblem(null);
    setBusy('writing');
    // let the button repaint before the write locks the thread for a few seconds
    await new Promise((r) => setTimeout(r, 30));
    try {
      await downloadWorkbook(data, depth);
    } catch {
      setProblem('the file was too large for this browser — try the fortnight instead');
    }
    setBusy(null);
  };

  const loadExcel = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setBusy('reading');
    await new Promise((r) => setTimeout(r, 30));
    try {
      // applyFarm reloads the page on success, so only a failure ever returns here
      setProblem(await applyFarm(await farmFromWorkbook(file)));
    } catch (e) {
      setProblem(e instanceof WorkbookError ? e.message : 'this file is not a readable spreadsheet');
    }
    setBusy(null);
  };

  const loadJson = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    try {
      setProblem(await applyFarm(JSON.parse(await file.text())));
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
          <button type="button" className="ghost-btn primary" onClick={save} disabled={busy !== null}>
            <XlIcon /> {busy === 'writing' ? t('dataWriting') : t('dataDownloadXl')}
          </button>
          <div className="data-depth" role="radiogroup" aria-label={t('dataDepth')}>
            {(['fortnight', 'season'] as Depth[]).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={depth === d}
                className="depth-btn"
                onClick={() => setDepth(d)}
              >
                {t(d === 'fortnight' ? 'dataLast14' : 'dataWholeSeason')}
              </button>
            ))}
          </div>
          <div className="data-panel-state">
            {t('dataRows', { n: fmt(Math.round(cowRows)), days })}
            {depth === 'season' && ` ${t('dataSeasonSlow')}`}
          </div>
          <button
            type="button"
            className="ghost-btn primary"
            onClick={() => excelRef.current?.click()}
            disabled={busy !== null}
          >
            <XlIcon /> {busy === 'reading' ? t('dataReading') : t('dataLoadXl')}
          </button>
          <button type="button" className="ghost-btn" onClick={() => void resetFarm()} disabled={!usingCustomFarm}>
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
        {recordCounts.cows + recordCounts.counts + recordCounts.grassland > 0 && (
          <p className="data-panel-hint">
            {t('dataUsingRecords', {
              cows: fmt(recordCounts.cows),
              counts: fmt(recordCounts.counts),
              grass: fmt(recordCounts.grassland),
            })}
          </p>
        )}

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
