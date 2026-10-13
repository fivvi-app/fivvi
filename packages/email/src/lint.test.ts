import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Templates must take all copy from the catalogs. The rule itself is tested in apps/web;
// this proves packages/email/biome.json registers it and that it runs.
const packageRoot = path.resolve(import.meta.dirname, '..');
const biome = createRequire(import.meta.url).resolve('@biomejs/biome/bin/biome');

type Diagnostic = { category: string; severity: string; location: { path: string } };
let dir: string;
let report: { summary: { infos: number }; diagnostics: Diagnostic[] };

beforeAll(async () => {
  const config = JSON.parse(await readFile(path.join(packageRoot, 'biome.json'), 'utf8'));
  const plugins = (config.plugins as string[]).map((p) => path.resolve(packageRoot, p));
  expect(plugins).toEqual([path.resolve(packageRoot, '../i18n/lint/no-hard-coded-jsx-text.grit')]);

  dir = await mkdtemp(path.join(tmpdir(), 'email-lint-'));
  await writeFile(
    path.join(dir, 'biome.json'),
    JSON.stringify({ root: true, plugins, linter: { rules: { preset: 'none' } } }),
  );
  const header = "import { Text } from 'react-email';\ndeclare const t: (key: string) => string;\n";
  await writeFile(
    path.join(dir, 'hardCoded.tsx'),
    `${header}export const C = () => <Text>Hoi Anna,</Text>;\n`,
  );
  await writeFile(
    path.join(dir, 'translated.tsx'),
    `${header}export const C = () => <Text>{t('email.hello.greeting')}</Text>;\n`,
  );
  const output = await promisify(execFile)(
    process.execPath,
    [biome, 'lint', '--reporter=json', '.'],
    { cwd: dir },
  ).catch((error: { stdout: string; stderr: string }) => error);
  report = JSON.parse(output.stdout);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const errorsIn = (file: string) =>
  report.diagnostics.filter(
    (d) => d.category === 'plugin' && d.severity === 'error' && d.location.path === file,
  );

describe('E006 lint rule: no hard-coded text in email templates', () => {
  it('runs without rule errors', () => {
    expect(report.summary.infos).toBe(0);
  });

  it('flags literal text in a template', () => {
    expect(errorsIn('hardCoded.tsx')).toHaveLength(1);
  });

  it('allows text from the catalog', () => {
    expect(errorsIn('translated.tsx')).toEqual([]);
  });
});
