import { execFile } from 'node:child_process';
import { readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import type { EnvironmentVariables } from './config.ts';

/** Runs `sentry-cli` with these arguments and extra environment variables. */
export type SentryCli = (args: string[], env: Readonly<Record<string, string>>) => Promise<void>;

export interface PublishSourceMapsOptions {
  /** The Next.js build output, `.next`. */
  buildDir: string;
  /** Defaults to `process.env` (`SENTRY_AUTH_TOKEN`, `RAILWAY_GIT_COMMIT_SHA`). */
  env?: EnvironmentVariables;
  /** Tests pass a fake; the build runs the real `sentry-cli`. */
  sentryCli?: SentryCli;
}

/** The Sentry project of the web app, which also receives the API's errors (spec #32). */
const SENTRY_PROJECT = 'web';

/** Where `next build` writes the maps of the browser and the server code. */
const UPLOADED_DIRS = ['static', 'server'];

/** Third-party packages traced into the standalone server, and the build cache, keep their files. */
const SKIPPED_DIRS = new Set(['node_modules', 'cache']);

/**
 * Runs after `next build`: uploads the source maps to Sentry, so production stack traces map to
 * the original TypeScript, then deletes every source map from the build output, so nobody can
 * download our source from the web app (AC2). The maps and the bundles carry the same debug IDs
 * (`turbopack.debugIds`), which is how Sentry matches them; the bundles are not changed.
 *
 * Without `SENTRY_AUTH_TOKEN` (local, CI, previews without a token) nothing is uploaded and
 * nothing talks to the network; the maps are still deleted. A failed upload only warns: a
 * Sentry outage must not block a deploy.
 */
export async function publishSourceMaps(options: PublishSourceMapsOptions): Promise<void> {
  const { buildDir, env = process.env, sentryCli = runSentryCli } = options;
  const token = env.SENTRY_AUTH_TOKEN?.trim();
  const release = env.RAILWAY_GIT_COMMIT_SHA?.trim();

  if (token) {
    try {
      await sentryCli(
        [
          'sourcemaps',
          'upload',
          '--project',
          SENTRY_PROJECT,
          ...(release ? ['--release', release] : []),
          ...UPLOADED_DIRS.map((dir) => path.join(buildDir, dir)),
        ],
        { SENTRY_AUTH_TOKEN: token },
      );
      console.log('Source maps uploaded to Sentry.');
    } catch (error) {
      console.warn(`Source maps NOT uploaded to Sentry: ${String(error)}`);
    }
  } else {
    console.log('No SENTRY_AUTH_TOKEN: source maps not uploaded to Sentry.');
  }

  const deleted = await deleteSourceMaps(buildDir);
  console.log(`Deleted ${deleted} source maps from the build output.`);
}

async function deleteSourceMaps(dir: string): Promise<number> {
  let deleted = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) {
      deleted += await deleteSourceMaps(entryPath);
    } else if (entry.isFile() && entry.name.endsWith('.map')) {
      await rm(entryPath);
      deleted += 1;
    }
  }
  return deleted;
}

async function runSentryCli(args: string[], env: Readonly<Record<string, string>>): Promise<void> {
  const cli = createRequire(import.meta.url).resolve('@sentry/cli/bin/sentry-cli');
  const { stdout } = await promisify(execFile)(process.execPath, [cli, ...args], {
    env: { ...process.env, ...env },
  });
  console.log(stdout);
}
