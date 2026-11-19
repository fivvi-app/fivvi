import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyze } from './analyze.ts';
import { readCatalogSet } from './catalog.ts';
import { runChecks } from './checks.ts';
import { sortedCatalogs, unsortedCatalogProblems } from './sort.ts';

const packageRoot = path.resolve(import.meta.dirname, '../..');
const SORT_COMMAND = 'pnpm --filter @fivvi/i18n sort';

describe('E001 #1272 sorted catalogs', () => {
  describe('sortedCatalogs', () => {
    it('sorts the keys at every object level and keeps every value', () => {
      const set = {
        messages: {
          'nl-NL': { b: { y: 'Y', x: 'X' }, a: { z: 'Z' } },
          en: { b: { y: 'Y', x: 'X' }, a: { z: 'Z' } },
        },
        comments: { 'b.y': 'comment y', 'a.z': 'comment z', 'b.x': 'comment x' },
      };
      const sorted = sortedCatalogs(set);
      expect(JSON.stringify(sorted.messages['nl-NL'])).toBe(
        '{"a":{"z":"Z"},"b":{"x":"X","y":"Y"}}',
      );
      expect(JSON.stringify(sorted.messages.en)).toBe('{"a":{"z":"Z"},"b":{"x":"X","y":"Y"}}');
      expect(JSON.stringify(sorted.comments)).toBe(
        '{"a.z":"comment z","b.x":"comment x","b.y":"comment y"}',
      );
    });

    it('puts a group before the keys that start with its name, as the flat comment keys sort', () => {
      const set = {
        messages: { 'nl-NL': { helloWorld: { a: 'A' }, hello: { a: 'A' } }, en: {} },
        comments: { 'helloWorld.a': 'c2', 'hello.a': 'c1' },
      };
      const sorted = sortedCatalogs(set);
      expect(Object.keys(sorted.messages['nl-NL'] as object)).toEqual(['hello', 'helloWorld']);
      expect(Object.keys(sorted.comments as object)).toEqual(['hello.a', 'helloWorld.a']);
    });
  });

  describe('check sorted', () => {
    const base = {
      messages: {
        'nl-NL': { a: { x: 'X', y: 'Y' }, b: { z: 'Z' } },
        en: { a: { x: 'X', y: 'Y' }, b: { z: 'Z' } },
      },
      comments: { 'a.x': 'c', 'b.z': 'c' },
    };

    it('AC6: passes on sorted catalogs', () => {
      expect(unsortedCatalogProblems(base)).toEqual([]);
    });

    it.each([
      ['en.json', { messages: { ...base.messages, en: { b: { z: 'Z' }, a: base.messages.en.a } } }],
      [
        'nl-NL.json',
        { messages: { ...base.messages, 'nl-NL': { a: { y: 'Y', x: 'X' }, b: { z: 'Z' } } } },
      ],
      ['comments.json', { comments: { 'b.z': 'c', 'a.x': 'c' } }],
    ])('AC6: fails on an unsorted %s and names the sorting command', (file, change) => {
      const problems = unsortedCatalogProblems({ ...base, ...change });
      expect(problems).toHaveLength(2);
      expect(problems[0]).toContain(file);
      expect(problems[0]).toContain('comes after');
      expect(problems[1]).toBe(`Run \`${SORT_COMMAND}\` and commit the result.`);
    });

    it('AC6: names the object level and the first key out of order', () => {
      const problems = unsortedCatalogProblems({
        ...base,
        messages: { ...base.messages, en: { a: { y: 'Y', x: 'X' }, b: { z: 'Z' } } },
      });
      expect(problems[0]).toBe('en.json: "a.x" comes after "a.y"; keys must be sorted');
    });

    it('AC6: runChecks reports it as the sorted check', async () => {
      const [result] = await runChecks('unused', ['sorted'], {
        set: { ...base, comments: { 'b.z': 'c', 'a.x': 'c' } },
      });
      expect(result?.name).toBe('sorted');
      expect(result?.problems.join('\n')).toContain(SORT_COMMAND);
    });
  });

  describe('the committed catalogs', () => {
    it('AC6: en.json, nl-NL.json and comments.json are sorted', async () => {
      expect(unsortedCatalogProblems(await readCatalogSet(packageRoot))).toEqual([]);
    });

    it('AC6: sorting them again changes nothing', async () => {
      const set = await readCatalogSet(packageRoot);
      expect(sortedCatalogs(set)).toEqual(set);
    });
  });

  describe('CLI', () => {
    let root: string;

    beforeEach(async () => {
      root = await mkdtemp(path.join(tmpdir(), 'i18n-sort-'));
      for (const file of ['nl-NL.json', 'en.json', 'comments.json', 'generated']) {
        await cp(path.join(packageRoot, file), path.join(root, file), { recursive: true });
      }
    });

    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });

    const run = async (...args: string[]) => {
      try {
        const { stdout, stderr } = await promisify(execFile)(
          process.execPath,
          [path.join(packageRoot, 'src/cli.ts'), ...args, '--root', root],
          { env: { ...process.env, NO_COLOR: '1' } },
        );
        return { code: 0, output: stdout + stderr };
      } catch (error) {
        const failed = error as { code: number; stdout: string; stderr: string };
        return { code: failed.code, output: failed.stdout + failed.stderr };
      }
    };

    /** Appends a key at the end of each catalog and of comments.json, as a PR does. */
    const appendKey = async () => {
      for (const [file, text] of [
        ['nl-NL.json', 'Eerste'],
        ['en.json', 'First'],
      ] as const) {
        const full = path.join(root, file);
        const catalog = JSON.parse(await readFile(full, 'utf8'));
        catalog.app = { ...catalog.app, aaaFirst: text };
        await writeFile(full, `${JSON.stringify(catalog, null, 2)}\n`);
      }
      const comments = JSON.parse(await readFile(path.join(root, 'comments.json'), 'utf8'));
      comments['app.aaaFirst'] = 'Test comment';
      await writeFile(path.join(root, 'comments.json'), `${JSON.stringify(comments, null, 2)}\n`);
    };

    it('AC6: check exits non-zero on an unsorted catalog and names the sorting command', async () => {
      await appendKey();
      const { code, output } = await run('check', 'sorted');
      expect(output).toContain('✗ i18n sorted');
      expect(output).toContain('Run `pnpm --filter @fivvi/i18n sort`');
      expect(code).toBe(1);
    });

    it('AC6: sort writes the catalogs sorted, keeping every text and comment, and check then passes', async () => {
      await appendKey();
      const before = await readCatalogSet(root);
      const { code } = await run('sort');
      expect(code).toBe(0);

      const after = await readCatalogSet(root);
      expect(unsortedCatalogProblems(after)).toEqual([]);
      const flat = (set: typeof after) => {
        const analysis = analyze(set);
        return {
          keys: analysis.keys,
          comments: [...analysis.comments].sort(),
          texts: Object.fromEntries(
            (['nl-NL', 'en'] as const).map((locale) => [
              locale,
              [...analysis.compiled[locale].keys()].sort(),
            ]),
          ),
        };
      };
      expect(flat(after)).toEqual(flat(before));
      expect(JSON.stringify(after.messages['nl-NL'])).toContain('"aaaFirst":"Eerste"');
      expect(after.comments).toHaveProperty(['app.aaaFirst'], 'Test comment');
      expect((await run('check', 'sorted')).code).toBe(0);
      expect(await readFile(path.join(root, 'en.json'), 'utf8')).toMatch(/\n$/);
    });
  });
});
