/**
 * The work a request does after its answer (an email, a product event) is handed to the server's
 * `runInBackground`. In an integration test the suite collects those tasks here and waits for them,
 * so none outlives its test: a task still in flight when the next test clears the email transport
 * would send into that test, and its `sent.at(-1)` would be the wrong email (#1269, #1275).
 */
export interface BackgroundTasks {
  /** Pass it as `runInBackground`; it works without its object. */
  run: (task: Promise<void>) => void;
  /** The tasks handed over and not yet waited for. */
  readonly count: number;
  /**
   * Waits for every task, also for those a task hands over while it runs. Fails with the error of
   * the first task that failed, after all have ended.
   */
  settle: () => Promise<void>;
  /**
   * For a `beforeEach`, before the transport is cleared: waits for the tasks of the earlier test
   * and drops their errors, which are not the next test's to fail on.
   */
  reset: () => Promise<void>;
}

export function createBackgroundTasks(): BackgroundTasks {
  const tasks: Promise<void>[] = [];

  /** Waits for rounds of tasks until none is left; returns the failures. */
  async function drain(): Promise<unknown[]> {
    const failures: unknown[] = [];
    while (tasks.length > 0) {
      const results = await Promise.allSettled(tasks.splice(0));
      for (const result of results) {
        if (result.status === 'rejected') failures.push(result.reason);
      }
    }
    return failures;
  }

  return {
    run: (task) => {
      tasks.push(task);
    },
    get count() {
      return tasks.length;
    },
    settle: async () => {
      const failures = await drain();
      if (failures.length > 0) throw failures[0];
    },
    reset: async () => {
      await drain();
    },
  };
}
