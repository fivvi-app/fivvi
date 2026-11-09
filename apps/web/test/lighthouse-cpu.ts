// The CPU slowdown of the Lighthouse budget runs (F064 AC15), calibrated to the host.
//
// Lighthouse expresses its CPU throttling relative to the machine it runs on: it simulates a
// mid-tier phone (a Moto G4 class device) by slowing the host's own measurements down, 4x by
// default, which assumes a high-end desktop. A slower host (a CI runner) with the same 4x emulates
// a slower phone, and the same page looks slower. Lighthouse documents how to calibrate this
// (docs/throttling.md, "CPU Throttling" and "Calibrating the CPU slowdown"): measure the host's
// `benchmarkIndex` and set `throttling.cpuSlowdownMultiplier` from it. This file is that
// calculation, with the formula of the "Lighthouse CPU slowdown calculator" the document links to
// (https://lighthouse-cpu-throttling-calculator.vercel.app/), which the table of the document
// summarises. It lives outside `e2e/` so a unit test covers it.

/** The multiplier is never below 1 (the host is never emulated as faster than itself) ... */
export const CPU_SLOWDOWN_MIN = 1;
/** ... and never above 20, the largest multiplier of the document's table (high-end desktop to low-end mobile). */
export const CPU_SLOWDOWN_MAX = 20;

/** Below this `benchmarkIndex` the calculator says the host is too slow to emulate the target device. */
const TOO_SLOW_BELOW = 150;

export interface CpuCalibration {
  /** The `cpuSlowdownMultiplier` to give Lighthouse: the calculator's best estimate, within 1x to 20x. */
  multiplier: number;
  /** The range the calculator gives around the estimate, within 1x to 20x. */
  range: [number, number];
  /** The host is below the calculator's floor: it cannot emulate the target, and runs at 1x. */
  tooSlow: boolean;
}

function clamp(value: number): number {
  return Math.min(CPU_SLOWDOWN_MAX, Math.max(CPU_SLOWDOWN_MIN, value));
}

/**
 * The multiplier for a host with this `benchmarkIndex` (`lhr.environment.benchmarkIndex`): the
 * calculator's three segments, continuous from one to the next, 1x at 150, 2x at 800, 3x at 1300
 * and 4x at about 1530 (the high-end desktop the default assumes).
 */
export function calibrateCpuSlowdown(benchmarkIndex: number): CpuCalibration {
  if (!Number.isFinite(benchmarkIndex)) {
    throw new Error(`The benchmarkIndex of the host is not a number: ${benchmarkIndex}`);
  }
  if (benchmarkIndex < TOO_SLOW_BELOW) {
    return { multiplier: CPU_SLOWDOWN_MIN, range: [CPU_SLOWDOWN_MIN, 1.25], tooSlow: true };
  }
  let estimate: number;
  let spread: number;
  if (benchmarkIndex >= 1300) {
    const above = (benchmarkIndex - 1300) / 233;
    estimate = 3 + above;
    spread = Math.max(above, 1.5, 0.3 * estimate) / 2;
  } else if (benchmarkIndex >= 800) {
    estimate = 2 + (benchmarkIndex - 800) / 500;
    spread = 0.75;
  } else {
    estimate = 1 + (benchmarkIndex - TOO_SLOW_BELOW) / 650;
    spread = 0.25;
  }
  return {
    multiplier: clamp(estimate),
    range: [clamp(estimate - spread), clamp(estimate + spread)],
    tooSlow: false,
  };
}

/** The middle of the samples (the mean of the two middle ones for an even number). */
export function medianOf(samples: readonly number[]): number {
  if (samples.length === 0) throw new Error('No samples to take the median of');
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const low = sorted[middle - 1] ?? 0;
  const high = sorted[middle] ?? 0;
  return sorted.length % 2 === 0 ? (low + high) / 2 : high;
}
