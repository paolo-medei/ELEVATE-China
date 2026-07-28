/**
 * Writes farm-data.xlsx — the whole database as a spreadsheet, next to the app.
 *
 * The app's Data menu builds the very same workbook in the browser; this script exists so
 * the file ships with the repo and can be opened without running anything.
 *
 *   npm run make-xlsx            # animal records for the last 14 days
 *   npm run make-xlsx -- season  # the whole season, a quarter of a million rows
 */
import writeXlsxFile from 'write-excel-file/node';
import { statSync } from 'node:fs';
import { workbookSheets } from '../src/data/workbookLayout';
import { firstDayOf, recordSheets } from '../src/data/recordSheets';
import { buildDataset } from '../src/data/simulate';
import { FARM } from '../src/data/source';

const depth = process.argv.includes('season') ? 'season' : 'fortnight';
const data = buildDataset();
const sheets = [...workbookSheets(FARM), ...recordSheets(data, depth)];

// the node and browser writers take the same sheet shape but declare a different
// FileContent, so the cast is only about which file API is available
await writeXlsxFile(sheets as never).toFile('farm-data.xlsx');

const cowRows = sheets.find((s) => s.sheet === 'Cow positions')!.data.length - 1;
console.log(
  `farm-data.xlsx — ${sheets.length} sheets, ${cowRows.toLocaleString('en')} animal positions ` +
    `from day ${firstDayOf(data, depth)}, ${(statSync('farm-data.xlsx').size / 1e6).toFixed(1)} MB`,
);
