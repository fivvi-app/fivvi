import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

export interface MainResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Runs the cron entrypoint in its own Node process, as Railway does, with only `env`. */
export function runMain(env: Record<string, string>): Promise<MainResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [MAIN],
      { env: { PATH: process.env.PATH ?? '', TZ: 'UTC', ...env }, timeout: 20_000 },
      (error, stdout, stderr) => {
        const exitCode = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
        resolve({ exitCode, stdout, stderr });
      },
    );
  });
}
