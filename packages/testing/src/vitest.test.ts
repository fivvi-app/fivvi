import { describe, expect, it } from 'vitest';
import { integrationConfig, unitConfig } from './vitest.ts';

describe('E010 Vitest presets', () => {
  it('runs tests in UTC, whatever the machine time zone is', () => {
    expect(process.env.TZ).toBe('UTC');
    expect(new Date('2026-07-15T12:00:00').toISOString()).toBe('2026-07-15T12:00:00.000Z');
  });

  it('keeps integration and e2e tests out of the unit suite', () => {
    const { test } = unitConfig();

    expect(test?.include).toEqual(['**/*.test.{ts,tsx}']);
    expect(test?.exclude).toEqual(
      expect.arrayContaining(['**/*.integration.test.{ts,tsx}', 'e2e/**', '**/node_modules/**']),
    );
  });

  it('runs only integration tests in the integration suite, without retries', () => {
    const { test } = integrationConfig();

    expect(test?.include).toEqual(['**/*.integration.test.{ts,tsx}']);
    expect(test?.retry).toBe(0);
    expect(test?.env).toEqual({ TZ: 'UTC' });
  });

  it('merges overrides into the preset', () => {
    const { test } = integrationConfig({
      test: { globalSetup: ['./setup.ts'], exclude: ['x/**'] },
    });

    expect(test?.globalSetup).toEqual(['./setup.ts']);
    expect(test?.exclude).toEqual(expect.arrayContaining(['e2e/**', 'x/**']));
    expect(test?.testTimeout).toBe(30_000);
  });
});
