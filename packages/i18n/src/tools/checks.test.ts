import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyze } from './analyze.ts';
import { runChecks } from './checks.ts';
import { writeNativeCatalogs } from './generate.ts';
import { catalogSet } from './testing.ts';

const packageRoot = path.resolve(import.meta.dirname, '../..');

describe('E005 i18n checks', () => {
  describe('parity', () => {
    it('fails when a key is added to only one locale', () => {
      const { parity } = analyze(
        catalogSet(
          { 'hello.title': 'Welkom', 'hello.extra': 'Alleen in het Nederlands' },
          {
            'hello.title': 'Welcome',
          },
        ),
      );
      expect(parity).toEqual(['"hello.extra" is in nl-NL.json but missing from en.json']);
    });

    it('fails when a key exists only in en', () => {
      const { parity } = analyze(
        catalogSet({ 'hello.title': 'Welkom' }, { 'hello.title': 'Welcome', 'hello.extra': 'x' }),
      );
      expect(parity).toEqual(['"hello.extra" is in en.json but missing from nl-NL.json']);
    });

    it('fails when the locales use different placeholders', () => {
      const { parity } = analyze(
        catalogSet(
          { 'hello.greeting': 'Hoi {naam}', 'hello.count': '{n, plural, one {#} other {#}}' },
          { 'hello.greeting': 'Hi {name}', 'hello.count': 'Count: {n}' },
        ),
      );
      expect(parity).toEqual([
        '"hello.count" has different placeholders per locale: nl-NL {n, plural}, en {n}',
        '"hello.greeting" has different placeholders per locale: nl-NL {naam}, en {name}',
      ]);
    });

    it.each([
      [{ title: 'x' }, '"title" must be inside a namespace'],
      [{ hello: { Title: 'x' } }, '"hello.Title": key segments are lowerCamelCase'],
      [{ hello: { 'sub-title': 'x' } }, '"hello.sub-title": key segments are lowerCamelCase'],
      [{ hello: { title: '' } }, '"hello.title" is empty'],
      [{ hello: { title: 3 } }, '"hello.title" must be a string or an object of messages'],
      [{ hello: {} }, '"hello" is an empty group'],
    ])('rejects invalid catalog structure %j', (tree, problem) => {
      const { parity } = analyze({ messages: { 'nl-NL': tree, en: tree }, comments: {} });
      expect(parity).toContainEqual(expect.stringContaining(problem));
    });

    it('fails when two keys map to the same Android resource name', () => {
      const messages = { 'hello.spotsLeft': 'a', 'hello.spots.left': 'b' };
      const { parity } = analyze(catalogSet(messages, messages));
      expect(parity).toEqual([
        '"hello.spots.left" and "hello.spotsLeft" both become Android resource "hello_spots_left"; rename one',
      ]);
    });

    it('fails when a translator comment refers to a key that does not exist', () => {
      const { parity } = analyze(catalogSet({ 'a.b': 'x' }, { 'a.b': 'x' }, { 'a.c': 'Context' }));
      expect(parity).toEqual(['comments.json: "a.c" is not a key in nl-NL.json']);
    });
  });

  describe('icu', () => {
    it('reports invalid syntax per locale and key', () => {
      const { icu } = analyze(catalogSet({ 'a.b': 'Hoi {name' }, { 'a.b': 'Hi {name}' }));
      expect(icu).toEqual([
        'nl-NL.json: "a.b": invalid ICU syntax: EXPECT_ARGUMENT_CLOSING_BRACE at offset 4',
      ]);
    });

    it('reports constructs the native exporters cannot convert', () => {
      const messages = { 'a.b': '{d, date, long}' };
      const { icu } = analyze(catalogSet(messages, messages));
      expect(icu).toHaveLength(2);
      expect(icu[0]).toMatch(/^nl-NL\.json: "a\.b": date formatting .* is not supported/);
    });
  });

  describe('generated', () => {
    let root: string;

    beforeEach(async () => {
      root = await mkdtemp(path.join(tmpdir(), 'i18n-check-'));
      const set = catalogSet({ 'hello.title': 'Welkom' }, { 'hello.title': 'Welcome' });
      await writeFile(path.join(root, 'nl-NL.json'), JSON.stringify(set.messages['nl-NL']));
      await writeFile(path.join(root, 'en.json'), JSON.stringify(set.messages.en));
      await writeNativeCatalogs(root);
    });

    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it('passes right after generating', async () => {
      const results = await runChecks(root);
      expect(results.map((r) => [r.name, r.problems])).toEqual([
        ['parity', []],
        ['icu', []],
        ['generated', []],
      ]);
    });

    it('fails when the JSON changed but the native catalogs were not regenerated', async () => {
      await writeFile(path.join(root, 'en.json'), JSON.stringify({ hello: { title: 'Hello' } }));
      const [generated] = await runChecks(root, ['generated']);
      expect(generated?.problems).toEqual([
        'generated/ios/Localizable.xcstrings is out of date',
        'generated/android/values-en/strings.xml is out of date',
        'Run `pnpm --filter @trainer-hub/i18n generate` and commit the result.',
      ]);
    });

    it('fails on a hand-edited or stray generated file', async () => {
      const xml = path.join(root, 'generated/android/values/strings.xml');
      await writeFile(xml, (await readFile(xml, 'utf8')).replace('Welkom', 'Welkom!'));
      await writeFile(path.join(root, 'generated/android/strings-old.xml'), '');
      const [generated] = await runChecks(root, ['generated']);
      expect(generated?.problems).toContain('generated/android/values/strings.xml is out of date');
      expect(generated?.problems).toContain(
        'generated/android/strings-old.xml is not produced by the generator; delete it',
      );
    });
  });

  describe('CLI (what `pnpm check` runs in CI)', () => {
    let root: string;

    beforeEach(async () => {
      root = await mkdtemp(path.join(tmpdir(), 'i18n-cli-'));
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

    it('passes on the committed catalogs', async () => {
      const { code, output } = await run('check');
      expect(output).toContain('✓ i18n parity');
      expect(output).toContain('✓ i18n icu');
      expect(output).toContain('✓ i18n generated');
      expect(code).toBe(0);
    });

    it('exits non-zero when a key is added to only one locale', async () => {
      const nlFile = path.join(root, 'nl-NL.json');
      const nl = JSON.parse(await readFile(nlFile, 'utf8'));
      nl.hello.onlyInDutch = 'Alleen in het Nederlands';
      await writeFile(nlFile, JSON.stringify(nl));

      const { code, output } = await run('check', 'parity');
      expect(output).toContain('✗ i18n parity: 1 problem(s)');
      expect(output).toContain('"hello.onlyInDutch" is in nl-NL.json but missing from en.json');
      expect(code).toBe(1);
    });

    it('refuses to generate from catalogs with problems', async () => {
      const enFile = path.join(root, 'en.json');
      await writeFile(enFile, JSON.stringify({ hello: { title: '{oops' } }));
      const { code, output } = await run('generate');
      expect(output).toContain('invalid ICU syntax');
      expect(code).toBe(1);
    });
  });
});
