import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  openPrivilegedDatabase,
  PRIVILEGED_ALLOW_LIST,
  PRIVILEGED_USES,
  type PrivilegedReason,
} from './privileged.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

interface SourceFile {
  /** Path from the repository root, with `/`. */
  path: string;
  content: string;
}

/** The files that may mention the variable of the privileged connection. */
const READERS = new Set(['packages/database/src/env.ts', 'packages/database/src/privileged.ts']);
/** Where the privileged path is defined and re-exported: not uses of it. */
const DEFINITIONS = new Set([
  'packages/database/src/privileged.ts',
  'packages/database/src/index.ts',
]);

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'build',
  'coverage',
  'generated',
]);
/** Test code and test setup connect to throw-away databases; they are not application code. */
const TEST_DIRECTORIES = new Set(['test', 'tests', '__tests__', 'e2e', 'testing']);
const SOURCE = /\.(ts|tsx|mts|mjs|js)$/;
const NOT_APPLICATION_CODE = /\.(test|spec|config)\.[a-z]+$|(^|\/)global-setup\.ts$/;

function sourceFiles(directory: string, found: SourceFile[] = []): SourceFile[] {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(name) && !TEST_DIRECTORIES.has(name)) sourceFiles(path, found);
    } else if (SOURCE.test(name) && !NOT_APPLICATION_CODE.test(name)) {
      found.push({
        path: relative(ROOT, path).split(sep).join('/'),
        content: readFileSync(path, 'utf8'),
      });
    }
  }
  return found;
}

/** Application code of the apps and packages: the code that can reach the database. */
function applicationFiles(): SourceFile[] {
  return ['apps', 'packages'].flatMap((top) =>
    readdirSync(join(ROOT, top)).flatMap((name) => {
      const directory = join(ROOT, top, name);
      return statSync(directory).isDirectory() && !TEST_DIRECTORIES.has(name)
        ? sourceFiles(directory)
        : [];
    }),
  );
}

/** Code without its comments, which say `DATABASE_URL` a lot. `://` in a string is not a comment. */
function withoutComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\w])\/\/.*$/gm, '$1');
}

const VARIABLE = /(?<![A-Za-z0-9_])DATABASE_URL(?![A-Za-z0-9_])/;
const CALL = /(?<![A-Za-z0-9_$])openPrivilegedDatabase\s*\(\s*(?:(['"])([^'"]*)\1)?/g;

/**
 * Every way a source file can use the privileged connection without being reviewed (AC17):
 * reading its variable, calling `openPrivilegedDatabase` from a file or for a reason that is not
 * on the allow-list, and allow-list entries nobody uses any more.
 */
function privilegedViolations(
  files: readonly SourceFile[],
  allowList: Readonly<Record<string, string>>,
  reasons: ReadonlySet<string>,
): string[] {
  const violations: string[] = [];
  const used = new Set<string>();
  for (const { path, content } of files) {
    const code = withoutComments(content);
    if (!READERS.has(path) && VARIABLE.test(code)) {
      violations.push(`${path}: reads DATABASE_URL, the privileged connection`);
    }
    if (DEFINITIONS.has(path)) continue;
    for (const [, , reason] of code.matchAll(CALL)) {
      if (reason === undefined) {
        violations.push(`${path}: the reason of openPrivilegedDatabase must be a string literal`);
      } else if (!reasons.has(reason)) {
        violations.push(`${path}: "${reason}" is not a reason on the allow-list`);
      } else if (allowList[path] !== reason) {
        violations.push(`${path}: is not on the allow-list for the reason "${reason}"`);
      } else {
        used.add(path);
      }
    }
  }
  for (const path of Object.keys(allowList)) {
    if (!used.has(path)) {
      violations.push(`${path}: is on the allow-list but no longer uses the privileged path`);
    }
  }
  return violations;
}

describe('E011 privileged database path', () => {
  it('AC17: privileged access only from the allow-list, with a reason', () => {
    const reasons = new Set(Object.keys(PRIVILEGED_USES));
    expect(privilegedViolations(applicationFiles(), PRIVILEGED_ALLOW_LIST, reasons)).toEqual([]);
  });

  describe('the check itself', () => {
    const reasons = new Set(['release']);
    const allowed = { 'apps/job/main.ts': 'release' };
    const check = (files: SourceFile[], list: Record<string, string> = allowed) =>
      privilegedViolations(files, list, reasons);
    const file = (path: string, content: string): SourceFile => ({ path, content });

    it('accepts a use on the allow-list with its reason', () => {
      expect(
        check([file('apps/job/main.ts', "const { db } = openPrivilegedDatabase('release');")]),
      ).toEqual([]);
    });

    it('fails for a use outside the allow-list', () => {
      expect(
        check([
          file('apps/job/main.ts', "openPrivilegedDatabase('release')"),
          file('apps/web/server/other.ts', "openPrivilegedDatabase('release')"),
        ]),
      ).toEqual(['apps/web/server/other.ts: is not on the allow-list for the reason "release"']);
    });

    it('fails for a reason that is not on the allow-list, or not a literal', () => {
      expect(
        check([
          file(
            'apps/job/main.ts',
            "openPrivilegedDatabase('because')\nopenPrivilegedDatabase(why)",
          ),
        ]),
      ).toEqual([
        'apps/job/main.ts: "because" is not a reason on the allow-list',
        'apps/job/main.ts: the reason of openPrivilegedDatabase must be a string literal',
        'apps/job/main.ts: is on the allow-list but no longer uses the privileged path',
      ]);
    });

    it('fails for a file that reads DATABASE_URL itself', () => {
      expect(
        check([
          file('apps/job/main.ts', "openPrivilegedDatabase('release')"),
          file(
            'apps/web/server/database.ts',
            'new Pool({ connectionString: process.env.DATABASE_URL })',
          ),
        ]),
      ).toEqual(['apps/web/server/database.ts: reads DATABASE_URL, the privileged connection']);
    });

    it('does not mistake APP_DATABASE_URL, TEST_DATABASE_URL or a comment for a use', () => {
      expect(
        check([
          file('apps/job/main.ts', "openPrivilegedDatabase('release')"),
          file(
            'apps/web/server/database.ts',
            [
              '// never print DATABASE_URL, it holds the password',
              '/* DATABASE_URL */ const a = process.env.APP_DATABASE_URL;',
              'const b = process.env.TEST_DATABASE_URL; const c = "https://example.com";',
            ].join('\n'),
          ),
        ]),
      ).toEqual([]);
    });

    it('fails for an allow-list entry nobody uses any more', () => {
      expect(check([file('apps/job/main.ts', 'export {}')])).toEqual([
        'apps/job/main.ts: is on the allow-list but no longer uses the privileged path',
      ]);
    });
  });

  describe('openPrivilegedDatabase', () => {
    const env = { DATABASE_URL: 'postgres://owner:hunter2@localhost:5432/trainer_hub' };

    it('logs the reason and not the connection', async () => {
      const logs: string[] = [];

      const { close } = openPrivilegedDatabase('release', { env, log: (m) => logs.push(m) });
      await close();

      expect(logs).toEqual([`Privileged database access: release (${PRIVILEGED_USES.release}).`]);
      expect(logs.join()).not.toContain('hunter2');
      expect(logs.join()).not.toContain('localhost');
    });

    it('refuses a reason that is not on the allow-list, before it connects', () => {
      const logs: string[] = [];

      expect(() =>
        openPrivilegedDatabase('anna@example.com' as PrivilegedReason, {
          env,
          log: (m) => logs.push(m),
        }),
      ).toThrow('Unknown privileged database reason.');
      expect(logs).toEqual([]);
    });

    it('needs DATABASE_URL, and does not use the app connection instead', () => {
      expect(() =>
        openPrivilegedDatabase('release', {
          env: { APP_DATABASE_URL: 'postgres://fivvi_app:secret@localhost/db' },
          log: () => {},
        }),
      ).toThrow('DATABASE_URL is not set');
    });

    it('has a plain description for every reason, without personal data', () => {
      for (const description of Object.values(PRIVILEGED_USES)) {
        expect(description).toMatch(/^[a-z][A-Za-z0-9 ,:()-]+$/);
        expect(description).not.toContain('@');
      }
    });
  });
});
