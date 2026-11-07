import { describe, expect, it } from 'vitest';
import {
  CPU_SLOWDOWN_MAX,
  CPU_SLOWDOWN_MIN,
  calibrateCpuSlowdown,
  medianOf,
} from './lighthouse-cpu';

// F064 AC15: the CPU slowdown of the budget runs follows the host's `benchmarkIndex`, by the
// formula of Lighthouse's own CPU throttling calculator (docs/throttling.md, "Calibrating the CPU
// slowdown"), so the emulated CPU is Lighthouse's target device on every host.
describe('F064 calibrateCpuSlowdown', () => {
  it.each([
    // The calculator's three segments, each from its own start: a slow, a mid-tier and a fast host.
    [150, 1],
    [475, 1.5],
    [800, 2],
    [1050, 2.5],
    [1300, 3],
    [1533, 4],
    [2000, 6.0043],
  ])('is %d -> %d for a benchmarkIndex of %d', (benchmarkIndex, multiplier) => {
    expect(calibrateCpuSlowdown(benchmarkIndex).multiplier).toBeCloseTo(multiplier, 3);
  });

  it('gives the reference desktop of the default (about 1500) about the default 4x', () => {
    expect(calibrateCpuSlowdown(1500).multiplier).toBeGreaterThan(3.5);
    expect(calibrateCpuSlowdown(1600).multiplier).toBeLessThan(4.5);
  });

  it('slows a faster host more and a slower host less', () => {
    const indexes = [200, 500, 800, 1000, 1300, 1700, 2500, 4000];
    const multipliers = indexes.map((index) => calibrateCpuSlowdown(index).multiplier);
    expect(multipliers).toEqual([...multipliers].sort((a, b) => a - b));
    expect(new Set(multipliers).size).toBe(indexes.length);
  });

  it('never goes below 1, and says when the host is too slow to emulate the target', () => {
    for (const benchmarkIndex of [0, 1, 100, 149]) {
      const calibration = calibrateCpuSlowdown(benchmarkIndex);
      expect(calibration.multiplier).toBe(CPU_SLOWDOWN_MIN);
      expect(calibration.tooSlow).toBe(true);
    }
    expect(calibrateCpuSlowdown(150).tooSlow).toBe(false);
    expect(calibrateCpuSlowdown(-5).multiplier).toBe(1);
  });

  it('stays within the documented range, 1x to 20x', () => {
    expect(CPU_SLOWDOWN_MIN).toBe(1);
    expect(CPU_SLOWDOWN_MAX).toBe(20);
    expect(calibrateCpuSlowdown(100_000).multiplier).toBe(20);
    expect(calibrateCpuSlowdown(5000).multiplier).toBeLessThanOrEqual(20);
  });

  it('refuses a benchmark that is not a number rather than guessing a multiplier', () => {
    expect(() => calibrateCpuSlowdown(Number.NaN)).toThrow(/benchmarkIndex/);
    expect(() => calibrateCpuSlowdown(Number.POSITIVE_INFINITY)).toThrow(/benchmarkIndex/);
  });

  it('reports the range the calculator gives around the estimate, inside 1x to 20x', () => {
    const { multiplier, range } = calibrateCpuSlowdown(1300);
    expect(range[0]).toBeLessThan(multiplier);
    expect(range[1]).toBeGreaterThan(multiplier);
    expect(range[0]).toBeGreaterThanOrEqual(1);
    expect(calibrateCpuSlowdown(100_000).range[1]).toBe(20);
  });
});

describe('F064 medianOf', () => {
  it('takes the middle sample, so one run disturbed by other work does not decide', () => {
    expect(medianOf([4100, 900, 4200])).toBe(4100);
    expect(medianOf([3, 1, 2, 4])).toBe(2.5);
    expect(medianOf([7])).toBe(7);
  });

  it('has no median of nothing', () => {
    expect(() => medianOf([])).toThrow();
  });
});
