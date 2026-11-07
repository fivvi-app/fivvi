import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../../..');
// The web source and the token CSS a page loads. Tests and docs may name what is forbidden.
const scanned = [
  'apps/web/app',
  'apps/web/site',
  'packages/ui/src',
  'packages/design-tokens/generated/web',
];
const sourceFile = /\.(tsx?|css|html)$/;
const testFile = /\.(test|spec)\./;

async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) return await sources(relative);
      return sourceFile.test(entry.name) && !testFile.test(entry.name) ? [relative] : [];
    }),
  );
  return nested.flat();
}

describe('E020 web font', () => {
  it('AC12: no source loads a web font or sets font-display', async () => {
    const forbidden: [string, RegExp][] = [
      ['next/font', /next\/font/],
      ['@font-face', /@font-face/],
      ['font-display', /font-display/],
      ['a font host', /fonts\.(googleapis|gstatic)\.com|use\.typekit\.net|fonts\.bunny\.net/],
      ['a font file', /\.(woff2?|ttf|otf)\b/],
    ];
    const found: string[] = [];
    for (const file of (await Promise.all(scanned.map(sources))).flat()) {
      const text = await readFile(path.join(root, file), 'utf8');
      for (const [name, pattern] of forbidden) {
        if (pattern.test(text)) found.push(`${file}: ${name}`);
      }
    }

    expect(found).toEqual([]);
  });
});
