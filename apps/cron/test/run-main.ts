import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const FAKE_DATE = fileURLToPath(new URL('./fake-date.ts', import.meta.url));

/**
 * Starting Node and loading the database package takes 3–5 s on a busy CI runner, more
 * than Vitest's 5 s default allows. Tests that call `runMain` use `SPAWN_TEST_TIMEOUT_MS`;
 * the process itself is killed after `MAIN_TIMEOUT_MS`, so a hang still fails the test.
 */
const MAIN_TIMEOUT_MS = 20_000;
export const SPAWN_TEST_TIMEOUT_MS = 30_000;

export interface RunMainOptions {
  /** An ISO instant the process takes for "now" (`test/fake-date.ts`). Default: the real time. */
  now?: string;
}

export interface MainResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the cron entrypoint in its own Node process, as Railway does, with only `env`. */
export function runMain(
  env: Record<string, string>,
  { now }: RunMainOptions = {},
): Promise<MainResult> {
  const args = now ? ['--import', FAKE_DATE, MAIN] : [MAIN];
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      args,
      {
        env: { PATH: process.env.PATH ?? '', TZ: 'UTC', ...(now && { FAKE_NOW: now }), ...env },
        timeout: MAIN_TIMEOUT_MS,
      },
      (error, stdout, stderr) => {
        // `null` when the process was killed (timeout), so a hang never passes as exit 1.
        const exitCode = error ? (typeof error.code === 'number' ? error.code : null) : 0;
        resolve({ exitCode, stdout, stderr });
      },
    );
  });
}
