import { unitConfig } from '@trainer-hub/testing/vitest';

export default unitConfig({
  test: {
    // test/check.test.ts runs the real CLI (`node src/cli.ts`) as a child process, up to
    // three times per test. That is deterministic but slow on a busy CI runner: one test
    // took 5078 ms there and hit Vitest's 5 s default. 30 s matches the integration preset
    // and still fails a test that hangs.
    testTimeout: 30_000,
  },
});
