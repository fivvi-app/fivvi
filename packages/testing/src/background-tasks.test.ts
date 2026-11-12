import { describe, expect, it } from 'vitest';
import { createBackgroundTasks } from './background-tasks.ts';

/** A gate the test opens itself, so no test waits on a clock. */
function createGate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/** A task that sends its email once the gate opens, as a request's work after its answer does. */
const sendsAfter = (gate: Promise<void>, sent: string[], email: string) =>
  gate.then(() => {
    sent.push(email);
  });

/** Lets every promise that can settle without the gate settle. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('#1275 background tasks of the integration suites', () => {
  it('reset waits for a task that sends late, so it cannot land after the transport is cleared', async () => {
    const tasks = createBackgroundTasks();
    const gate = createGate();
    const sent: string[] = [];
    tasks.run(sendsAfter(gate.opened, sent, 'first-test'));

    let reset = false;
    const resetting = tasks.reset().then(() => {
      reset = true;
    });
    await flush();
    expect(reset).toBe(false);

    gate.open();
    await resetting;
    expect(sent).toEqual(['first-test']);
    sent.length = 0; // the transport.clear() of the next test's beforeEach

    await flush();
    expect(sent).toEqual([]);
  });

  it('settle waits for the tasks so far and leaves none behind', async () => {
    const tasks = createBackgroundTasks();
    const gate = createGate();
    const sent: string[] = [];
    tasks.run(sendsAfter(gate.opened, sent, 'a'));
    tasks.run(sendsAfter(gate.opened, sent, 'b'));

    let settled = false;
    const settling = tasks.settle().then(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);

    gate.open();
    await settling;

    expect(sent.sort()).toEqual(['a', 'b']);
    expect(tasks.count).toBe(0);
  });

  it('settle also waits for a task that a task hands over while it runs', async () => {
    const tasks = createBackgroundTasks();
    const gate = createGate();
    const sent: string[] = [];
    tasks.run(
      (async () => {
        await Promise.resolve();
        tasks.run(sendsAfter(gate.opened, sent, 'follow-up'));
      })(),
    );

    let settled = false;
    const settling = tasks.settle().then(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);

    gate.open();
    await settling;

    expect(sent).toEqual(['follow-up']);
  });

  it('settle fails with the error of a task, as the suites expect of their own waits', async () => {
    const tasks = createBackgroundTasks();
    tasks.run(Promise.reject(new Error('send failed')));

    await expect(tasks.settle()).rejects.toThrow('send failed');
    expect(tasks.count).toBe(0);
  });

  it('settle fails also when the task rejected with undefined', async () => {
    const tasks = createBackgroundTasks();
    tasks.run(Promise.reject(undefined));

    await expect(tasks.settle()).rejects.toBeUndefined();
    expect(tasks.count).toBe(0);
  });

  it('reset does not fail the next test with the error of an earlier one', async () => {
    const tasks = createBackgroundTasks();
    tasks.run(Promise.reject(new Error('send failed')));

    await expect(tasks.reset()).resolves.toBeUndefined();
    expect(tasks.count).toBe(0);
  });

  it('run can be handed over as it is, without its object', async () => {
    const tasks = createBackgroundTasks();
    const { run } = tasks;
    const gate = createGate();
    const sent: string[] = [];

    run(sendsAfter(gate.opened, sent, 'x'));
    gate.open();
    await tasks.settle();

    expect(sent).toEqual(['x']);
  });
});
