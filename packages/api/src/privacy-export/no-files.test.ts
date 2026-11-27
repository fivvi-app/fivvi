import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// ADR-010 (E014): the export is generated per request and streamed; nothing is written to a disk.
// The modules that make it import no file-system module, so a later change that stages a file
// fails here before it reaches a server.

const here = dirname(fileURLToPath(import.meta.url));
const modules = [
  ...readdirSync(here)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => join(here, name)),
  join(here, '../routes/privacy-export.ts'),
  join(here, '../../../domain/src/privacy/export.ts'),
  join(here, '../../../database/src/repositories/privacy-export.ts'),
];

describe('E014 export: no file is made', () => {
  it('names the modules of the export', () => {
    expect(modules.length).toBeGreaterThanOrEqual(5);
  });

  it.each(modules)('%s imports no file-system or temp-file module', (path) => {
    const source = readFileSync(path, 'utf8');
    expect(source).not.toMatch(
      /from\s+['"](?:node:)?(?:fs|fs\/promises|os|stream\/web)['"]|require\(['"](?:node:)?(?:fs|os)/,
    );
    expect(source).not.toMatch(/\b(?:tmpdir|mkdtemp|writeFile|createWriteStream)\b/);
  });
});
