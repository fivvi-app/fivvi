import { mkdirSync, writeFileSync } from 'node:fs';
import { buildImportSample, IMPORT_SAMPLE_FILES } from '../import-sample.ts';

// `pnpm --filter @fivvi/testing generate:import-sample`: writes the synthetic import sample
// (E015) to packages/testing/fixtures/. The same input always gives the same bytes.
const folder = new URL('../../fixtures/', import.meta.url);
const sample = await buildImportSample();

mkdirSync(folder, { recursive: true });
writeFileSync(new URL(IMPORT_SAMPLE_FILES.workbook, folder), sample.workbook);
for (const [sheet, text] of Object.entries(sample.csv)) {
  writeFileSync(new URL(IMPORT_SAMPLE_FILES.csv(sheet), folder), text);
}
writeFileSync(
  new URL(IMPORT_SAMPLE_FILES.expected, folder),
  `${JSON.stringify(sample.expected, null, 2)}\n`,
);
console.log(`Wrote ${folder.pathname}`);
