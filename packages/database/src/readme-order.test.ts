import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// E001 #1483, AC7 of spec #1481: every feature that adds tables adds one paragraph to the README,
// `**Title** (`src/schema/<file>.ts`, …`. They are kept sorted by that schema file, so two PRs that
// add a paragraph edit different places in the file and don't conflict. The README's script table is
// not one of them: it is ordered by what a developer does first, and no PR appends to it.
const README = path.resolve(import.meta.dirname, '../README.md');
const ENTRY = /^\*\*([^*]+)\*\* \(`src\/schema\/([a-z0-9-]+)\.ts`/;

/** One line per paragraph that is out of order, naming where it goes. */
function readmeOrderProblems(text: string): string[] {
  // A run of consecutive entry paragraphs is one list; the paragraph about `businessTable` that also
  // names a schema file is a list of its own.
  const problems: string[] = [];
  let before: { title: string; file: string } | undefined;
  for (const paragraph of text.split('\n\n')) {
    const match = ENTRY.exec(paragraph);
    if (!match) {
      before = undefined;
      continue;
    }
    const entry = { title: match[1] as string, file: match[2] as string };
    if (before && entry.file < before.file) {
      problems.push(
        `packages/database/README.md: move the paragraph "${entry.title}" (src/schema/${entry.file}.ts) before "${before.title}" (src/schema/${before.file}.ts); the paragraphs that describe a schema file are sorted by its file name`,
      );
    }
    before = entry;
  }
  return problems;
}

describe('E001 #1483 the paragraphs of the database README that describe a schema file stay sorted', () => {
  it('has them sorted by schema file', async () => {
    const text = await readFile(README, 'utf8');
    expect(text.split('\n\n').filter((p) => ENTRY.test(p)).length).toBeGreaterThan(2);
    expect(readmeOrderProblems(text)).toEqual([]);
  });

  it('names the paragraph to move when two are out of order', () => {
    const text = [
      '**Payouts** (`src/schema/payouts.ts`, F061).',
      '**Offers** (`src/schema/offers.ts`, F052).',
    ].join('\n\n');
    expect(readmeOrderProblems(text)).toEqual([
      'packages/database/README.md: move the paragraph "Offers" (src/schema/offers.ts) before "Payouts" (src/schema/payouts.ts); the paragraphs that describe a schema file are sorted by its file name',
    ]);
  });
});
