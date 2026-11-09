import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { runChecks } from '../src/check.ts';
import { contrastRatio, contrastResults } from '../src/contrast.ts';
import { readTokenSource, type TokenSource } from '../src/source.ts';
import { withValue } from './tokens.ts';

const packageRoot = path.resolve(import.meta.dirname, '..');

describe('E007 design tokens contrast check', () => {
  let source: TokenSource;

  beforeAll(async () => {
    source = await readTokenSource(packageRoot);
  });

  it('computes the WCAG contrast ratio', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#777777')).toBeCloseTo(4.478, 3);
    expect(contrastRatio('#E6164A', '#E6164A')).toBe(1);
  });

  it('AC3: all declared pairs pass in light and dark', async () => {
    // The v2 pairs: text, icons, tints, gradients, workspace dots and the trainer web.
    expect(source.pairs.length).toBeGreaterThanOrEqual(100);
    const results = await contrastResults(source);
    expect(results).toHaveLength(source.pairs.length * 2);
    expect(results.filter((result) => !result.passes)).toEqual([]);

    const [check] = await runChecks(packageRoot, ['contrast'], source);
    expect(check?.problems).toEqual([]);
  });

  it('AC3: a failing pair fails with pair, mode and ratio', async () => {
    const broken = {
      ...source,
      dark: withValue(source.dark, 'color.status.neutral.fg', '#5A5A60'),
    };
    const [check] = await runChecks(packageRoot, ['contrast'], broken);
    expect(check?.problems).toEqual([
      'color.status.neutral.fg on color.status.neutral.bg (Geboekt chip), dark: 1.97:1, needs 4.5:1',
    ]);
  });

  it('AC3: a non-text pair needs 3:1; ratios are rounded down', async () => {
    const broken = { ...source, light: withValue(source.light, 'color.border.control', '#B1B1B8') };
    const [check] = await runChecks(packageRoot, ['contrast'], broken);
    expect(check?.problems).toEqual([
      'color.border.control on color.bg.surface (Input outline), light: 2.13:1, needs 3:1',
      'color.border.control on color.bg.raised (Input outline in a sheet), light: 2.13:1, needs 3:1',
      'color.border.control on color.bg.canvas (Input outline on the canvas), light: 1.91:1, needs 3:1',
      'color.border.control on color.web.trainer.background (Trainer web: input outline on background), light: 2.13:1, needs 3:1',
      'color.border.control on color.web.trainer.card (Trainer web: input outline on card), light: 2.13:1, needs 3:1',
    ]);

    const almost = {
      ...source,
      light: withValue(source.light, 'color.web.client.secondary', '#777777'),
    };
    const [rounded] = await runChecks(packageRoot, ['contrast'], almost);
    expect(rounded?.problems).toContain(
      'color.web.client.secondary on color.bg.surface (Secondary text on a card (client web)), light: 4.47:1, needs 4.5:1',
    );
  });
});
