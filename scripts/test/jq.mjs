// jq for the scripts tests. The input goes in a file and jq gets no stdin: a piped input has hung under load, the
// pipe never ending, and then the whole test run waited for it (#1294). A jq that does not finish fails in bounded time.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Runs `jq <args> <file with input>`; returns the spawnSync result (encoding utf8). Throws when jq does not finish. */
export function jq(args, input) {
  const limit = Number(process.env.FIVVI_TEST_JQ_TIMEOUT_MS ?? 30000);
  const dir = mkdtempSync(join(tmpdir(), 'jq-input-'));
  try {
    writeFileSync(join(dir, 'input.json'), input);
    const result = spawnSync('jq', [...args, join(dir, 'input.json')], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: limit,
    });
    if (result.error?.code === 'ETIMEDOUT')
      throw new Error(`jq did not finish within ${limit} ms: jq ${args.join(' ')}`);
    if (result.error) throw result.error;
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Like `jq`, but returns stdout and throws with jq's stderr when it fails. */
export function jqOutput(args, input) {
  const result = jq(args, input);
  if (result.status !== 0) throw new Error(`jq failed (${result.status}): ${result.stderr}`);
  return result.stdout;
}
