import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

/**
 * Starting Node and loading the database package takes 3–5 s on a busy CI runner, more
 * than Vitest's 5 s default allows. Tests that call `runMain` use `SPAWN_TEST_TIMEOUT_MS`;
 * the process itself is killed after `MAIN_TIMEOUT_MS`, so a hang still fails the test.
 */
const MAIN_TIMEOUT_MS = 20_000;
export const SPAWN_TEST_TIMEOUT_MS = 30_000;

export interface MainResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the cron entrypoint in its own Node process, as Railway does, with only `env`. */
export function runMain(env: Record<string, string>): Promise<MainResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [MAIN],
      { env: { PATH: process.env.PATH ?? '', TZ: 'UTC', ...env }, timeout: MAIN_TIMEOUT_MS },
      (error, stdout, stderr) => {
        // `null` when the process was killed (timeout), so a hang never passes as exit 1.
        const exitCode = error ? (typeof error.code === 'number' ? error.code : null) : 0;
        resolve({ exitCode, stdout, stderr });
      },
    );
  });
}
