import { defineConfig } from 'vitest/config';

// Unit tests only: no database. Integration tests run with `test:integration`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: { TZ: 'UTC' },
  },
});
