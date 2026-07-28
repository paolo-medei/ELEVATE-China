/**
 * Writes farm-data.xlsx — the Excel view of the database, next to the app.
 *
 * The app's Data menu builds the very same workbook in the browser; this script exists so
 * the spreadsheet ships with the repo and can be opened without running anything.
 *
 *   npm run make-xlsx
 */
import writeXlsxFile from 'write-excel-file/node';
import { workbookSheets } from '../src/data/workbookLayout';
import { FARM } from '../src/data/source';

const sheets = workbookSheets(FARM);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- node and browser writers
// take the same sheet shape but declare a different FileContent
await writeXlsxFile(sheets as any).toFile('farm-data.xlsx');

console.log(`farm-data.xlsx — ${sheets.map((s) => s.sheet).join(', ')}`);
