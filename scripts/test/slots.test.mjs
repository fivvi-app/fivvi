import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

const SCRIPTS = join(import.meta.dirname, '..');
const SLOTS = join(SCRIPTS, 'slots.sh');

// The slot links of a class whose holder still runs. A holder that is gone leaves its link behind: that is a free slot,
// which the next job takes over, so it does not count.
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const liveHolders = (folder) =>
  existsSync(folder)
    ? readdirSync(folder)
        .filter((f) => f.startsWith('slot-'))
        .filter((f) => alive(Number(readlinkSync(join(folder, f)).split('|')[0])))
    : [];

// E001 #1388: machine-wide slots for the heavy jobs of a factory run (scripts/slots.sh, scripts/_slots.sh).
describe('E001 #1388 slots.sh: machine-wide slots for heavy jobs', () => {
  let base;
  let dir;
  let n = 0;
  const children = [];
  before(() => {
    base = mkdtempSync(join(tmpdir(), 'slots-'));
  });
  after(() => rmSync(base, { recursive: true, force: true }));
  afterEach(() => {
    for (const child of children.splice(0)) child.kill('SIGKILL');
  });

  const env = (extra = {}) => ({
    PATH: process.env.PATH,
    HOME: base,
    FIVVI_SLOTS_DIR: dir,
    FIVVI_SLOT_POLL_SECONDS: '0.1',
    ...extra,
  });
  const fresh = () => {
    dir = join(base, `slots-${n++}`);
    return dir;
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (condition, what, ms = 15_000) => {
    const start = Date.now();
    while (!condition()) {
      if (Date.now() - start > ms) assert.fail(`timed out waiting for ${what}`);
      await sleep(50);
    }
  };

  const hold = (cls) => liveHolders(join(dir, cls)).length;

  // A job that holds its slots until the release file shows up. Its output is collected.
  const job = (classes, { label = classes, extra = {}, command } = {}) => {
    const release = join(base, `release-${n++}`);
    const started = `${release}.started`;
    const child = spawn(
      SLOTS,
      [
        'run',
        classes,
        '--label',
        label,
        '--',
        'sh',
        '-c',
        command ?? `touch "${started}"; while [ ! -e "${release}" ]; do sleep 0.1; done`,
      ],
      { env: env(extra), stdio: ['ignore', 'pipe', 'pipe'] },
    );
    children.push(child);
    const out = { stdout: '', stderr: '' };
    child.stdout.on('data', (d) => (out.stdout += d));
    child.stderr.on('data', (d) => (out.stderr += d));
    const exit = new Promise((resolve) =>
      child.on('close', (status, signal) => resolve({ status, signal })),
    );
    return {
      child,
      out,
      exit,
      running: () => existsSync(started),
      finish: () => writeFileSync(release, ''),
    };
  };

  const run = (args, extra = {}) =>
    spawnSync(SLOTS, args, { env: env(extra), encoding: 'utf8', timeout: 30_000 });
  const deadPid = () => spawnSync('true').pid;
  const plant = (cls, i, target) => {
    mkdirSync(join(dir, cls), { recursive: true });
    symlinkSync(target, join(dir, cls, `slot-${i}`));
  };

  it('AC1: two jobs share the heavy slots (2 by default) and a third waits, says so, and runs when one ends', async () => {
    fresh();
    const a = job('heavy', { label: 'check.sh integration (wt-a)' });
    const b = job('heavy', { label: 'check.sh e2e (wt-b)' });
    await until(() => a.running() && b.running(), 'two jobs to run');
    assert.equal(hold('heavy'), 2);
    const c = job('heavy', { label: 'test-ios.sh (wt-c)' });
    await until(
      () => /waiting for a heavy slot/.test(c.out.stderr),
      'the third job to say it waits',
    );
    assert.ok(!c.running(), 'the third job does not run');
    // The wait names the holders with their labels and ages.
    assert.match(c.out.stderr, /pid \d+ \(check\.sh integration \(wt-a\), \d+ min\)/);
    assert.match(c.out.stderr, /pid \d+ \(check\.sh e2e \(wt-b\), \d+ min\)/);
    a.finish();
    await until(() => c.running(), 'the third job to take the freed slot');
    assert.equal((await a.exit).status, 0);
    b.finish();
    c.finish();
    assert.equal((await b.exit).status, 0);
    assert.equal((await c.exit).status, 0);
    assert.equal(hold('heavy'), 0, 'every slot is free again');
  });

  it('AC1: FIVVI_HEAVY_SLOTS changes the number of heavy slots', async () => {
    fresh();
    const one = { FIVVI_HEAVY_SLOTS: '1' };
    const a = job('heavy', { extra: one });
    await until(() => a.running(), 'the first job');
    const b = job('heavy', { extra: one });
    await until(
      () => /waiting for a heavy slot \(1 places/.test(b.out.stderr),
      'the second to wait',
    );
    a.finish();
    b.finish();
    await b.exit;

    fresh();
    const three = { FIVVI_HEAVY_SLOTS: '3' };
    const jobs = [
      job('heavy', { extra: three }),
      job('heavy', { extra: three }),
      job('heavy', { extra: three }),
    ];
    await until(() => jobs.every((j) => j.running()), 'three jobs to run at once');
    assert.equal(hold('heavy'), 3);
    for (const j of jobs) j.finish();
  });

  it('AC1: the simulator slot is separate: one booted iOS simulator and one Android emulator, whatever the heavy jobs do', async () => {
    fresh();
    const sim = job('heavy,ios-sim', { label: 'test-ios.sh (a)' });
    await until(() => sim.running(), 'the simulator job');
    assert.equal(hold('ios-sim'), 1);
    assert.equal(hold('heavy'), 1);
    // A second simulator job waits for the simulator although a heavy slot is free, and holds no heavy slot while it waits.
    const sim2 = job('heavy,ios-sim', { label: 'test-ios.sh (b)' });
    await until(
      () => /waiting for a ios-sim slot/.test(sim2.out.stderr),
      'the second simulator job to wait',
    );
    assert.equal(hold('heavy'), 1, 'the waiting job holds no heavy slot');
    // An emulator job and a plain heavy job are not held up by the simulator.
    const emu = job('heavy,android-emu', { label: 'android.sh (c)' });
    await until(() => emu.running(), 'the emulator job runs beside the simulator job');
    assert.equal(hold('android-emu'), 1);
    assert.equal(hold('heavy'), 2);
    const emu2 = job('android-emu', { label: 'maestro.sh (d)' });
    await until(
      () => /waiting for a android-emu slot/.test(emu2.out.stderr),
      'the second emulator job to wait',
    );
    assert.ok(!emu2.running());
    sim.finish();
    await until(() => sim2.running(), 'the second simulator job to take over the simulator');
    for (const j of [sim2, emu, emu2]) j.finish();
    await Promise.all([sim.exit, sim2.exit, emu.exit, emu2.exit]);
    assert.deepEqual([hold('heavy'), hold('ios-sim'), hold('android-emu')], [0, 0, 0]);
  });

  it('AC2: the slot is free again when the command fails, with its exit code', () => {
    fresh();
    const result = run(['run', 'heavy', '--', 'sh', '-c', 'exit 7']);
    assert.equal(result.status, 7, result.stderr);
    assert.equal(hold('heavy'), 0);
  });

  it('AC2: the slot is free again when the job is killed, also with SIGKILL, and the next job takes it at once', async () => {
    fresh();
    const one = { FIVVI_HEAVY_SLOTS: '1' };
    const a = job('heavy', { extra: one, label: 'killed job' });
    await until(() => a.running() && hold('heavy') === 1, 'the job to run');
    a.child.kill('SIGKILL');
    await a.exit;
    assert.equal(hold('heavy'), 0);
    const next = run(['run', 'heavy', '--label', 'next job', '--', 'true'], one);
    assert.equal(next.status, 0, next.stderr);
    assert.doesNotMatch(next.stderr, /waiting/);
    assert.match(readlinkSync(join(dir, 'heavy/slot-1')), /\|next job$/);
  });

  it('AC2: the command is the process that holds the slot (exec): its signals and exit code are its own', async () => {
    fresh();
    const a = job('heavy');
    await until(() => a.running(), 'the job to run');
    assert.equal(Number(readlinkSync(join(dir, 'heavy/slot-1')).split('|')[0]), a.child.pid);
    a.child.kill('SIGTERM');
    const { signal } = await a.exit;
    assert.equal(signal, 'SIGTERM');
    assert.equal(hold('heavy'), 0);
  });

  it('AC2: a job that nobody told about its parent (FIVVI_SLOTS_HELD) does not wait for the slot its parent holds', async () => {
    fresh();
    const one = { FIVVI_HEAVY_SLOTS: '1' };
    const outer = job('heavy', {
      extra: one,
      command: `"${SLOTS}" run heavy -- sh -c 'echo nested ran'; touch "${join(base, 'outer-done')}"`,
    });
    await until(() => existsSync(join(base, 'outer-done')), 'the nested run');
    assert.match(outer.out.stdout, /nested ran/);
    assert.equal((await outer.exit).status, 0);
  });

  it('AC3: takes over a slot whose holder is gone, and does not wait', () => {
    fresh();
    plant('heavy', 1, `${deadPid()}|${Math.floor(Date.now() / 1000)}||crashed (wt-x)`);
    plant('heavy', 2, `${deadPid()}|${Math.floor(Date.now() / 1000)}||crashed (wt-y)`);
    const result = run(['run', 'heavy', '--', 'true']);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /waiting/);
    assert.match(readlinkSync(join(dir, 'heavy/slot-1')), /\|true$/, 'slot 1 is taken over');
  });

  it('AC3: takes over a slot whose pid now belongs to another process (started later than the holder)', () => {
    fresh();
    // This test process is alive, but did not start at the time the link says: the pid was reused.
    plant('heavy', 1, `${process.pid}|1|Mon Jan  1 00:00:00 2001|reused pid`);
    const result = run(['run', 'heavy', '--', 'true'], { FIVVI_HEAVY_SLOTS: '1' });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /waiting/);
  });

  it('AC3: a slot of a live holder is not taken, and the wait times out with a message that names the holder', async () => {
    fresh();
    const a = job('heavy', { extra: { FIVVI_HEAVY_SLOTS: '1' }, label: 'test-ios.sh (wt-a)' });
    await until(() => a.running(), 'the holder');
    const result = run(['run', 'heavy', '--', 'true'], {
      FIVVI_HEAVY_SLOTS: '1',
      FIVVI_SLOT_TIMEOUT_SECONDS: '1',
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /no heavy slot free after \d+ s/);
    assert.match(result.stderr, /pid \d+ \(test-ios\.sh \(wt-a\), \d+ min\)/);
    assert.match(result.stderr, /FIVVI_SLOT_TIMEOUT_SECONDS/);
    assert.equal(hold('heavy'), 1, 'the holder keeps its slot');
    a.finish();
    await a.exit;
  });

  it('AC3: a command that is not run when no slot is free', () => {
    fresh();
    const marker = join(base, `ran-${n++}`);
    const holder = job('heavy', { extra: { FIVVI_HEAVY_SLOTS: '1' } });
    return until(() => holder.running(), 'the holder').then(async () => {
      const result = run(['run', 'heavy', '--', 'touch', marker], {
        FIVVI_HEAVY_SLOTS: '1',
        FIVVI_SLOT_TIMEOUT_SECONDS: '1',
      });
      assert.equal(result.status, 1);
      assert.ok(!existsSync(marker));
      holder.finish();
      await holder.exit;
    });
  });

  it('rejects an unknown class and a missing command with a usage error, and takes no slot', () => {
    fresh();
    const unknown = run(['run', 'gpu', '--', 'true']);
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /unknown slot class 'gpu'/);
    const none = run(['run', 'heavy']);
    assert.notEqual(none.status, 0);
    assert.equal(hold('heavy'), 0);
  });

  it('status lists every class, its holders with their ages, and the free places', async () => {
    fresh();
    const a = job('heavy,ios-sim', { label: 'test-ios.sh (wt-a)' });
    await until(() => a.running(), 'the job');
    plant('heavy', 2, `${deadPid()}|1||gone (wt-z)`);
    const result = run(['status']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /heavy +1 of 2 \(free: 1\)/);
    assert.match(result.stdout, /pid \d+ \(test-ios\.sh \(wt-a\), \d+ min\)/);
    assert.match(result.stdout, /ios-sim +1 of 1 \(full\)/);
    assert.match(result.stdout, /android-emu +0 of 1/);
    assert.match(result.stdout, /stale/);
    a.finish();
    await a.exit;
  });

  it('keeps the slots in the main checkout when run from a worktree (the default folder)', () => {
    const out = spawnSync(
      'bash',
      [
        '-c',
        `source "${SCRIPTS}/_lib.sh"; source "${SCRIPTS}/_slots.sh"; echo "$SLOTS_DIR $MAIN_ROOT"`,
      ],
      { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: base } },
    );
    const [slotsDir, main] = out.stdout.trim().split(' ');
    assert.equal(slotsDir, `${main}/.work/slots`);
  });
});

// The scripts that start the heavy jobs take their slots through slots_wrap, with the classes they need.
describe('E001 #1388 the heavy scripts take a slot', () => {
  const read = (file) => readFileSync(join(SCRIPTS, file), 'utf8');

  it('AC2: test-ios.sh, android.sh and maestro.sh wrap themselves in the slots of what they start', () => {
    assert.match(read('test-ios.sh'), /^source "\$ROOT\/scripts\/_slots\.sh"$/m);
    assert.match(read('test-ios.sh'), /^slots_wrap ".*heavy,ios-sim.*" "\$0" "\$@"$/m);
    assert.match(read('android.sh'), /slots_wrap heavy,android-emu "\$0" "\$@"/);
    assert.match(read('android.sh'), /slots_wrap heavy "\$0" "\$@"/);
    assert.match(read('maestro.sh'), /slots_wrap heavy,android-emu "\$0" "\$@"/);
    assert.match(read('maestro.sh'), /slots_wrap heavy,ios-sim "\$0" "\$@"/);
  });

  it('AC2: slots_wrap does nothing on CI and with FIVVI_SLOTS=off, and otherwise holds the slots in the script itself', () => {
    const base = mkdtempSync(join(tmpdir(), 'slots-wrap-'));
    try {
      const script = join(base, 'job.sh');
      writeFileSync(
        script,
        `#!/usr/bin/env bash
source "${SCRIPTS}/_lib.sh"
source "${SCRIPTS}/_slots.sh"
slots_wrap heavy,ios-sim "$0" "$@"
echo "ran held=\${FIVVI_SLOTS_HELD:-none} args=$*"
[ -L "$FIVVI_SLOTS_DIR/heavy/slot-1" ] && echo "holder=$(readlink "$FIVVI_SLOTS_DIR/heavy/slot-1" | cut -d"|" -f1) self=$$"
`,
        { mode: 0o755 },
      );
      const runWith = (extra) =>
        spawnSync(script, ['a', 'b'], {
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH,
            HOME: base,
            FIVVI_SLOTS_DIR: join(base, 'slots'),
            ...extra,
          },
        });
      const wrapped = runWith({});
      assert.equal(wrapped.status, 0, wrapped.stderr);
      assert.match(wrapped.stdout, /ran held=heavy,ios-sim args=a b/);
      const [, holder, self] = wrapped.stdout.match(/holder=(\d+) self=(\d+)/);
      assert.equal(holder, self, 'the script itself holds its slots');
      assert.deepEqual(liveHolders(join(base, 'slots', 'heavy')), [], 'free again at the end');
      assert.match(runWith({ CI: 'true' }).stdout, /ran held=none args=a b/);
      assert.match(runWith({ FIVVI_SLOTS: 'off' }).stdout, /ran held=none args=a b/);
      // A parent that holds the classes: the script runs as it is.
      assert.match(
        runWith({ FIVVI_SLOTS_HELD: 'heavy,ios-sim' }).stdout,
        /ran held=heavy,ios-sim args=a b/,
      );
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
