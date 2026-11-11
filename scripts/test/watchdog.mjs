// A global setup of `node --test` for the root tests (`--test-global-setup`): it runs in the runner, which stays
// responsive while the test files run in their own processes. A test file stuck in a blocking call (a hung spawnSync,
// #1294) cannot be stopped by a test timeout, because its event loop is blocked; so after FIVVI_TEST_WATCHDOG_MS
// (default 45 minutes; a run under load takes up to a quarter of that) the runner prints the processes it started, kills them and
// fails the run.
import { execFileSync } from 'node:child_process';

const processes = () =>
  execFileSync('ps', ['-A', '-o', 'pid=,ppid=,etime=,command='], { encoding: 'utf8' })
    .split('\n')
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line))
    .filter(Boolean)
    .map(([, pid, ppid, etime, command]) => ({
      pid: Number(pid),
      ppid: Number(ppid),
      etime,
      command,
    }));

/** The processes below `root`, parents before children. */
export function descendants(all, root) {
  const found = [];
  const queue = [root];
  while (queue.length > 0) {
    const parent = queue.shift();
    for (const candidate of all)
      if (candidate.ppid === parent && !found.includes(candidate)) {
        found.push(candidate);
        queue.push(candidate.pid);
      }
  }
  return found;
}

export function globalSetup() {
  const limit = Number(process.env.FIVVI_TEST_WATCHDOG_MS ?? 45 * 60 * 1000);
  const timer = setTimeout(() => {
    const running = descendants(processes(), process.pid);
    const listing = running
      .map((p) => `  ${p.pid} (${p.etime}) ${p.command.slice(0, 300)}`)
      .join('\n');
    console.error(
      `\nroot tests ran longer than ${limit / 1000} s (FIVVI_TEST_WATCHDOG_MS): a test is hung, ` +
        `most likely waiting on a child process that never ends. Running below the test runner:\n${listing}\n`,
    );
    for (const p of running.reverse()) {
      try {
        process.kill(p.pid, 'SIGKILL');
      } catch {
        // already gone
      }
    }
    process.exit(1);
  }, limit);
  timer.unref();
}
