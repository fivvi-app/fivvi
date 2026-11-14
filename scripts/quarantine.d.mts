// Types of scripts/quarantine.mjs for the TypeScript that imports it (the Vitest preset and the Playwright config).

export type Runner = 'vitest' | 'playwright' | 'xctest' | 'compose' | 'maestro';
export type Mode = 'only' | 'exclude';

export const LISTS: Runner[];
export const MARKERS: string[];
export const MAX_DAYS: number;

export interface Entry {
  test: string;
  bug: string;
  added: string;
  end: string;
}

export interface Options {
  dir?: string;
  mode?: Mode;
}

export function checkQuarantine(options?: { dir?: string; today?: string }): string[];
export function readList(runner: Runner, options?: { dir?: string }): Entry[];
export function quarantineMode(env?: Record<string, string | undefined>): Mode;
export function quarantineSelection(
  runner: Runner,
  options?: Options,
): { only: RegExp | undefined; exclude: RegExp | undefined };
export function vitestTestNamePattern(options?: Options): RegExp | undefined;
