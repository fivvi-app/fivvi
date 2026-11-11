import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The restore drill starts the helper five times (`scripts/restore-drill.sh`), so what the helper loads at start-up
// is paid five times per drill (#1309). On a CI runner loaded with other drills it took 4 to 6 s per start, and the
// drill tests spent most of their 60 s on it. The helper needs `pg` and its own few modules, not the ORM and the
// schema of the app, which cost about 0.8 s of CPU on an idle machine against 0.1 s for `pg`.

const PACKAGE = fileURLToPath(new URL('..', import.meta.url));
const IMPORT_LOG = fileURLToPath(new URL('../test/fixtures/log-imports.mjs', import.meta.url));

describe('#1309 the start-up of the restore helper', () => {
  const start = () =>
    spawnSync(process.execPath, ['--import', IMPORT_LOG, 'src/scripts/restore.ts'], {
      cwd: PACKAGE,
      encoding: 'utf8',
      // No variable of a connection: the helper must not need one to print its usage.
      env: { PATH: process.env.PATH ?? '' },
    });

  it('prints its usage and exits with 2 without a command', () => {
    const result = start();

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('Usage:');
  });

  it('loads neither the ORM nor the schema of the app', () => {
    const loaded = start()
      .stderr.split('\n')
      .filter((line) => line.startsWith('resolved '))
      .map((line) => line.slice('resolved '.length));

    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.filter((url) => /\/drizzle-orm\/|\/src\/(schema|client)\b/.test(url))).toEqual(
      [],
    );
  });
});
