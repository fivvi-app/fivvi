import { describe, expect, it } from 'vitest';
import { createBackgroundTasks } from './background-tasks.ts';

/** A task that sends its email only after `ms`, as a request's work after its answer does. */
const sendsLate = (sent: string[], email: string, ms = 20) =>
  new Promise<void>((resolve) => {
    setTimeout(() => {
      sent.push(email);
      resolve();
    }, ms);
  });

describe('#1275 background tasks of the integration suites', () => {
  it('reset settles a task that sends late, so it cannot land after the transport is cleared', async () => {
    const tasks = createBackgroundTasks();
    const sent: string[] = [];
    tasks.run(sendsLate(sent, 'first-test'));

    await tasks.reset();
    sent.length = 0; // the transport.clear() of the next test's beforeEach

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(sent).toEqual([]);
  });

  it('settle waits for the tasks so far and leaves none behind', async () => {
    const tasks = createBackgroundTasks();
    const sent: string[] = [];
    tasks.run(sendsLate(sent, 'a'));
    tasks.run(sendsLate(sent, 'b', 5));

    await tasks.settle();

    expect(sent.sort()).toEqual(['a', 'b']);
    expect(tasks.count).toBe(0);
  });

  it('settle also waits for a task that a task hands over while it runs', async () => {
    const tasks = createBackgroundTasks();
    const sent: string[] = [];
    tasks.run(
      (async () => {
        await Promise.resolve();
        tasks.run(sendsLate(sent, 'follow-up'));
      })(),
    );

    await tasks.settle();

    expect(sent).toEqual(['follow-up']);
  });

  it('settle fails with the error of a task, as the suites expect of their own waits', async () => {
    const tasks = createBackgroundTasks();
    tasks.run(Promise.reject(new Error('send failed')));

    await expect(tasks.settle()).rejects.toThrow('send failed');
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
    const sent: string[] = [];

    run(sendsLate(sent, 'x', 1));
    await tasks.settle();

    expect(sent).toEqual(['x']);
  });
});
