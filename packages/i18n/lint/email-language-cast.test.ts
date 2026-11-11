import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// F049 AC4: an EmailLanguage comes only from a resolver of @fivvi/i18n. The rule is the Biome
// plugin lint/email-language-cast.grit, registered for all code but packages/i18n/src/locale.ts and
// the tests in the root biome.json; lint runs for every package a change affects, so the rule bites
// wherever a cast is added. This runs it on fixtures laid out like the repo, and on the real code.
const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '../..');
const biome = createRequire(import.meta.url).resolve('@biomejs/biome/bin/biome');
const pluginPath = path.join(packageRoot, 'lint/email-language-cast.grit');
const REGISTERED = 'packages/i18n/lint/email-language-cast.grit';

const SPAWN_TIMEOUT_MS = 60_000;

type Diagnostic = {
  message: string;
  category: string;
  severity: string;
  location: { path: string; start: { line: number } };
};

async function runBiome(cwd: string, target: string): Promise<Diagnostic[]> {
  const output = await promisify(execFile)(
    process.execPath,
    [biome, 'lint', '--reporter=json', target],
    { cwd, env: { ...process.env, NO_COLOR: '1' } },
  ).catch((error: { stdout: string }) => error);
  return JSON.parse(output.stdout).diagnostics;
}

const pluginErrors = (diagnostics: Diagnostic[]) =>
  diagnostics.filter((d) => d.category === 'plugin' && d.severity === 'error');

// What the rule must refuse in code: one statement per fixture file.
const FORBIDDEN: Record<string, string> = {
  'a cast to EmailLanguage': 'export const a = locale as EmailLanguage;',
  'a cast through unknown': 'export const a = locale as unknown as EmailLanguage;',
  'an angle-bracket cast': 'export const a = <EmailLanguage>locale;',
  'a cast of a Locale': "export const a = 'en' as Locale as EmailLanguage;",
  'a locale cast to never': 'export const a = { to, locale: locale as never };',
  'a locale cast to any': 'export const a = { to, locale: locale as any };',
  'a cast to the locale of the send options':
    "export const a = { to, locale: locale as SendEmailOptions<Props>['locale'] };",
  'a cast to the locale of a mail': "export const a = locale as PrivateSessionMail['locale'];",
};

// What the code does today: types, resolvers and casts that are not of a language.
const ALLOWED = [
  "import type { EmailLanguage } from '@fivvi/i18n';",
  'export const a: EmailLanguage = resolveInternalCommunicationLanguage();',
  'export const b = { to, locale: resolveCommunicationLanguage({ workspaceDefault }) };',
  'export const c = value as string;',
  'export const d = { other: value as never, locale };',
  "export const e = value as Mail['subject'];",
];

let dir: string;
let diagnostics: Diagnostic[];
let allowedDiagnostics: Diagnostic[];
let realCode: Diagnostic[];
const fixtureFiles = Object.keys(FORBIDDEN).map((name, index) => ({
  name,
  file: `packages/email/src/forbidden-${index}.ts`,
}));

beforeAll(async () => {
  const root = JSON.parse(await readFile(path.join(repoRoot, 'biome.json'), 'utf8'));
  // The override of the root biome.json, with the plugin as an absolute path: the fixtures sit in
  // another folder than the repo's biome.json.
  const override = root.overrides.find((o: { plugins?: string[] }) =>
    o.plugins?.includes(REGISTERED),
  );
  expect(override?.plugins).toEqual([REGISTERED]);
  const config = {
    root: true,
    // The fixtures live in an ignored folder (test-results/), so the repo's own lint skips them.
    vcs: { enabled: false },
    linter: { rules: { preset: 'none' } },
    overrides: [{ includes: override.includes, plugins: [pluginPath] }],
  };
  await mkdir(path.join(packageRoot, 'test-results'), { recursive: true });
  dir = await mkdtemp(path.join(packageRoot, 'test-results', 'email-language-cast-'));
  await writeFile(path.join(dir, 'biome.json'), JSON.stringify(config));
  const write = async (file: string, source: string) => {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), `${source}\n`);
  };
  for (const { name, file } of fixtureFiles) await write(file, FORBIDDEN[name] ?? '');
  await write('packages/email/src/allowed.ts', ALLOWED.join('\n'));
  // The same casts where they are allowed: the one resolver file, and tests.
  const all = Object.values(FORBIDDEN).join('\n');
  await write('packages/i18n/src/locale.ts', all);
  await write('packages/email/src/send.test.ts', all);
  await write('packages/email/src/templates/hello.test.tsx', all);
  await write('apps/web/e2e/sign-in.ts', all);
  await write('apps/web/src/other.ts', 'export const x = locale as EmailLanguage;');
  diagnostics = await runBiome(dir, '.');
  allowedDiagnostics = diagnostics.filter((d) => d.location.path.endsWith('allowed.ts'));
  // The real code, with the repo's own configuration.
  realCode = await runBiome(repoRoot, 'packages apps');
}, SPAWN_TIMEOUT_MS);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('F049 no cast makes an EmailLanguage', () => {
  it.each(fixtureFiles)('fails lint on $name', ({ file }) => {
    const flagged = pluginErrors(diagnostics).filter((d) => d.location.path === file);
    expect(flagged.length).toBeGreaterThanOrEqual(1);
  });

  it('fails lint in any app or package, not only the email package', () => {
    const flagged = pluginErrors(diagnostics).filter((d) =>
      d.location.path.endsWith('apps/web/src/other.ts'),
    );
    expect(flagged.length).toBeGreaterThanOrEqual(1);
  });

  it('passes the resolvers, the type and other casts', () => {
    expect(allowedDiagnostics).toEqual([]);
  });

  it('leaves the resolver file and the tests free to cast', () => {
    const paths = pluginErrors(diagnostics).map((d) => d.location.path);
    expect(paths.filter((p) => p === 'packages/i18n/src/locale.ts')).toEqual([]);
    expect(paths.filter((p) => /\.test\.tsx?$|\/e2e\//.test(p))).toEqual([]);
  });

  it('passes the real code of the repo', () => {
    expect(pluginErrors(realCode).filter((d) => d.message.includes('F049'))).toEqual([]);
  });
});
