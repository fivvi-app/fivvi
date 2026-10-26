import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishSourceMaps, type SentryCli } from './source-maps.ts';

const SHA = '1111111111111111111111111111111111111111';
const TOKEN = 'sntrys_test-token';

// A Next.js build output, as `next build` leaves it (output: 'standalone').
const BUILD_FILES = [
  'static/chunks/0d-_h994g-g53.js',
  'static/chunks/1af-e75l40yld.js.map',
  'static/css/app.css',
  'static/css/app.css.map',
  'server/chunks/ssr/page._.js',
  'server/chunks/ssr/page._.js.map',
  'server/app/page.js.nft.json',
  'build/chunks/config._.js.map',
  'standalone/apps/web/server.js',
  'standalone/apps/web/.next/server/app/page.js',
  'standalone/apps/web/.next/server/app/page.js.map',
  // Third-party packages traced into the server keep their own files.
  'standalone/node_modules/next/dist/server.js.map',
];

let dir: string;
let buildDir: string;

beforeEach(async () => {
  const testResults = path.resolve(import.meta.dirname, '..', 'test-results');
  await mkdir(testResults, { recursive: true });
  dir = await mkdtemp(path.join(testResults, 'source-maps-'));
  buildDir = path.join(dir, '.next');
  for (const file of BUILD_FILES) {
    await mkdir(path.dirname(path.join(buildDir, file)), { recursive: true });
    await writeFile(path.join(buildDir, file), '');
  }
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function filesLeft(): Promise<string[]> {
  const entries = await readdir(buildDir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(buildDir, path.join(entry.parentPath, entry.name)))
    .sort();
}

const WITHOUT_OUR_MAPS = [
  'server/app/page.js.nft.json',
  'server/chunks/ssr/page._.js',
  'standalone/apps/web/.next/server/app/page.js',
  'standalone/apps/web/server.js',
  'standalone/node_modules/next/dist/server.js.map',
  'static/chunks/0d-_h994g-g53.js',
  'static/css/app.css',
];

describe('E009 web source maps', () => {
  it('AC5: without SENTRY_AUTH_TOKEN, deletes the source maps and uploads nothing', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sentryCli = vi.fn<SentryCli>();

    for (const env of [{}, { SENTRY_AUTH_TOKEN: '  ', RAILWAY_GIT_COMMIT_SHA: SHA }]) {
      await publishSourceMaps({ buildDir, env, sentryCli });
    }

    expect(sentryCli).not.toHaveBeenCalled();
    expect(await filesLeft()).toEqual(WITHOUT_OUR_MAPS);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('No SENTRY_AUTH_TOKEN'));
  });

  it('AC2: with SENTRY_AUTH_TOKEN, uploads the source maps to the web project, then deletes them', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const mapsAtUpload: string[][] = [];
    const sentryCli = vi.fn<SentryCli>(async () => {
      mapsAtUpload.push((await filesLeft()).filter((file) => file.endsWith('.map')));
    });

    await publishSourceMaps({
      buildDir,
      env: { SENTRY_AUTH_TOKEN: ` ${TOKEN} `, RAILWAY_GIT_COMMIT_SHA: SHA },
      sentryCli,
    });

    expect(sentryCli).toHaveBeenCalledExactlyOnceWith(
      [
        'sourcemaps',
        'upload',
        '--project',
        'web',
        '--release',
        SHA,
        path.join(buildDir, 'static'),
        path.join(buildDir, 'server'),
      ],
      { SENTRY_AUTH_TOKEN: TOKEN },
    );
    // Uploaded while the maps were still there; the browser's and the server's.
    expect(mapsAtUpload[0]).toEqual(expect.arrayContaining(['static/css/app.css.map']));
    expect(mapsAtUpload[0]).toEqual(expect.arrayContaining(['server/chunks/ssr/page._.js.map']));
    expect(await filesLeft()).toEqual(WITHOUT_OUR_MAPS);
  });

  it('uploads without a release when there is no commit SHA', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const sentryCli = vi.fn<SentryCli>();

    await publishSourceMaps({ buildDir, env: { SENTRY_AUTH_TOKEN: TOKEN }, sentryCli });

    expect(sentryCli.mock.calls[0]?.[0]).not.toContain('--release');
  });

  it('warns and still deletes the source maps when the upload fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sentryCli = vi.fn<SentryCli>(() => Promise.reject(new Error('401 Unauthorized')));

    await publishSourceMaps({ buildDir, env: { SENTRY_AUTH_TOKEN: TOKEN }, sentryCli });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('401 Unauthorized'));
    expect(await filesLeft()).toEqual(WITHOUT_OUR_MAPS);
  });
});
