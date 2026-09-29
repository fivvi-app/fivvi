import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The machine's time zone must never leak into formatting (TESTING.md §5.4).
    env: { TZ: 'UTC' },
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.next/**', 'e2e/**'],
  },
});
