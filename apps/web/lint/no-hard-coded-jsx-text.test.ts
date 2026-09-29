import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Runs the Biome plugin that apps/web/biome.json registers against fixture components.
const webRoot = path.resolve(import.meta.dirname, '..');
const biome = createRequire(import.meta.url).resolve('@biomejs/biome/bin/biome');

const flagged = {
  text: '<h1>Welkom</h1>',
  accentedText: '<p>Één</p>',
  stringChild: "<p>{'Welkom'}</p>",
  // biome-ignore lint/suspicious/noTemplateCurlyInString: JSX source of a fixture
  templateChild: '<p>{`Nog ${n} plekken`}</p>',
  conditional: "<p>{open ? 'Open' : t('closed')}</p>",
  logical: "<p>{full && 'Vol'}</p>",
  alt: '<img alt="Logo" src="/logo.png" />',
  placeholder: "<input placeholder={'Zoeken'} />",
  ariaLabel: '<button aria-label="Sluiten" type="button" />',
  title: '<abbr title="Personal trainer" />',
};

const allowed = {
  translated: "<h1>{t('hello.title')}</h1>",
  translatedAttribute: "<input placeholder={t('search.placeholder')} />",
  punctuation: "<p> · {' – '} </p>",
  // biome-ignore lint/suspicious/noTemplateCurlyInString: JSX source of a fixture
  templateWithoutText: '<p>{`${n} – ${n}`}</p>',
  number: '<p>{n}</p>',
  technicalAttributes:
    '<main className="page" data-testid="hello" lang="nl-NL" id="main"><a href="/x" /></main>',
  emptyTitle: '<p title="" />',
};

type Diagnostic = { category: string; severity: string; location: { path: string } };

let dir: string;
let report: { summary: { errors: number; infos: number }; diagnostics: Diagnostic[] };

beforeAll(async () => {
  // Use the plugin path from the web config, so the test also proves it's wired up.
  const webConfig = JSON.parse(await readFile(path.join(webRoot, 'biome.json'), 'utf8'));
  const plugins = (webConfig.plugins as string[]).map((p) => path.resolve(webRoot, p));
  expect(plugins).toContain(
    path.resolve(webRoot, '../../packages/i18n/lint/no-hard-coded-jsx-text.grit'),
  );

  dir = await mkdtemp(path.join(tmpdir(), 'jsx-text-lint-'));
  await writeFile(
    path.join(dir, 'biome.json'),
    JSON.stringify({ root: true, plugins, linter: { rules: { preset: 'none' } } }),
  );
  const header =
    'declare const t: (key: string) => string;\ndeclare const n: number, open: boolean, full: boolean;\n';
  for (const [name, jsx] of Object.entries({ ...flagged, ...allowed })) {
    await writeFile(path.join(dir, `${name}.tsx`), `${header}export const C = () => ${jsx};\n`);
  }

  // Biome exits non-zero when it finds errors; the report is on stdout either way.
  const output = await promisify(execFile)(
    process.execPath,
    [biome, 'lint', '--reporter=json', '.'],
    { cwd: dir },
  ).catch((error: { stdout: string; stderr: string }) => error);
  try {
    report = JSON.parse(output.stdout);
  } catch {
    throw new Error(`Biome produced no report; is the plugin valid?\n${output.stderr}`);
  }
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const errorsIn = (name: string) =>
  report.diagnostics.filter(
    (d) => d.category === 'plugin' && d.severity === 'error' && d.location.path === `${name}.tsx`,
  );

describe('E005 lint rule: no hard-coded JSX text (web)', () => {
  it('runs without rule errors', () => {
    // A broken GritQL pattern only produces an info diagnostic and lints nothing.
    expect(report.summary.infos).toBe(0);
    expect(report.diagnostics.filter((d) => d.category !== 'plugin')).toEqual([]);
  });

  it.each(Object.keys(flagged))('flags %s', (name) => {
    expect(errorsIn(name)).toHaveLength(1);
  });

  it.each(Object.keys(allowed))('allows %s', (name) => {
    expect(errorsIn(name)).toEqual([]);
  });
});
