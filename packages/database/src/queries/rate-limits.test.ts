import { expect, it } from 'vitest';
import type { DatabaseExecutor } from '../client.ts';
import { consumeRateLimit } from './rate-limits.ts';

/** An executor whose upsert returns no row, which a working database never does. */
const noRow = {
  insert: () => ({
    values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [] }) }),
  }),
} as unknown as DatabaseExecutor;

it('fails instead of letting a request through when the count did not come back', async () => {
  await expect(
    consumeRateLimit(noRow, 'address:abc', { max: 3, windowMinutes: 15 }, new Date()),
  ).rejects.toThrow(/returned no row/);
});
