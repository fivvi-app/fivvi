import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // The machine's time zone must never leak into formatting (TESTING.md §5.4).
    env: { TZ: 'UTC' },
  },
});
