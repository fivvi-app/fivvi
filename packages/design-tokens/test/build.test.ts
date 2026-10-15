import path from 'node:path';
import { compile } from 'tailwindcss';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  kotlinOutputs,
  renderOutputs,
  shadcnColours,
  swiftOutputs,
  webOutputs,
} from '../src/build.ts';
import {
  readTokenSource,
  semanticColours,
  type TokenSource,
  TokenSourceError,
} from '../src/source.ts';
import { customProperties, resolveVar } from './css.ts';
import { kotlinArguments, kotlinColours, nativeName, swiftColours } from './native.ts';
import { withoutToken } from './tokens.ts';

const packageRoot = path.resolve(import.meta.dirname, '..');
const hex = /^#[0-9a-f]{6}$/i;
const cssName = (tokenPath: string) => `--th-${tokenPath.replaceAll('.', '-')}`;

describe('E007 design tokens build', () => {
  let source: TokenSource;
  let outputs: Map<string, string>;
  const output = (file: string) => outputs.get(file) ?? '';

  beforeAll(async () => {
    source = await readTokenSource(packageRoot);
    outputs = await renderOutputs(source);
  });

  it('AC1: generates CSS, Tailwind theme, Swift and Kotlin with light and dark for every semantic colour', () => {
    expect([...outputs.keys()].sort()).toEqual(
      [
        ...Object.values(webOutputs),
        ...Object.values(swiftOutputs),
        ...Object.values(kotlinOutputs),
      ].sort(),
    );

    const swift = swiftColours(output(swiftOutputs.colors));
    const kotlin = kotlinColours(output(kotlinOutputs.colors));
    const { light, dark } = customProperties(output(webOutputs.tokens));
    const colours = semanticColours(source);
    expect(swift.size).toBe(colours.length);
    expect(kotlin.light.size).toBe(colours.length);
    expect(kotlin.dark.size).toBe(colours.length);
    for (const colour of colours) {
      const name = nativeName(colour);
      const expected = {
        light: light.get(cssName(colour))?.toUpperCase(),
        dark: dark.get(cssName(colour))?.toUpperCase(),
      };
      expect(swift.get(name), `Swift ${colour}`).toEqual(expected);
      expect(kotlin.light.get(name), `Kotlin ${colour} light`).toBe(expected.light);
      expect(kotlin.dark.get(name), `Kotlin ${colour} dark`).toBe(expected.dark);
    }
    // M0 draft values, resolved through the palette in each mode.
    expect(swift.get('actionPrimaryBgPressed')).toEqual({ light: '#49427F', dark: '#D2CDF2' });
    expect(kotlin.dark.get('bgCanvas')).toBe('#242428');
  });

  it('AC1: CSS variables have a light and a dark value for every semantic colour', () => {
    const colours = semanticColours(source);
    for (const group of ['bg', 'text', 'border', 'action', 'status', 'session']) {
      expect(colours.some((colour) => colour.startsWith(`color.${group}.`))).toBe(true);
    }

    const { light, dark } = customProperties(output(webOutputs.tokens));
    for (const colour of colours) {
      expect(light.get(cssName(colour)), `${colour} light`).toMatch(hex);
      expect(dark.get(cssName(colour)), `${colour} dark`).toMatch(hex);
    }
    // M0 draft values, resolved through the palette in each mode.
    expect(light.get('--th-color-bg-canvas')?.toUpperCase()).toBe('#F6F6F7');
    expect(dark.get('--th-color-bg-canvas')?.toUpperCase()).toBe('#242428');
    expect(dark.get('--th-color-action-tonal-bg')?.toUpperCase()).toBe('#3A3A41');
  });

  it('AC1: dark values follow the system setting, and apps never see the base palette', () => {
    const css = output(webOutputs.tokens);
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).not.toContain('--th-color-base-');
    expect(customProperties(css).light.get('--th-space-4')).toBe('16px');
  });

  it("AC1: shadcn's standard theme variables come from the semantic tokens in light and dark", () => {
    const properties = customProperties(output(webOutputs.tokens), output(webOutputs.shadcn));
    const standard = [
      'background',
      'foreground',
      'card',
      'popover',
      'primary',
      'secondary',
      'muted',
      'accent',
      'destructive',
      'border',
      'input',
      'ring',
    ];
    for (const name of standard) expect(Object.keys(shadcnColours)).toContain(name);

    for (const [name, token] of Object.entries(shadcnColours)) {
      for (const mode of ['light', 'dark'] as const) {
        const tokenValue = resolveVar(cssName(token), properties[mode]);
        expect(tokenValue, `${token} ${mode}`).toMatch(hex);
        expect(resolveVar(`--${name}`, properties[mode]), `--${name} ${mode}`).toBe(tokenValue);
      }
    }
    expect(resolveVar('--primary', properties.dark)?.toUpperCase()).toBe('#C1BBEB');
    expect(resolveVar('--radius', properties.light)).toBe('12px');
  });

  it('AC1: session and status colours are extra theme variables in light and dark', () => {
    const properties = customProperties(output(webOutputs.tokens), output(webOutputs.shadcn));
    const extras = semanticColours(source).filter((p) => /^color\.(session|status)\./.test(p));
    expect(extras).toContain('color.status.warning.fg');
    for (const token of extras) {
      const name = `--${token.replace(/^color\./, '').replaceAll('.', '-')}`;
      for (const mode of ['light', 'dark'] as const) {
        expect(resolveVar(name, properties[mode]), `${name} ${mode}`).toBe(
          resolveVar(cssName(token), properties[mode]),
        );
      }
    }
  });

  it('AC1: the Tailwind v4 theme turns the theme variables into utilities', async () => {
    const tailwind = await compile(`${output(webOutputs.theme)}\n@tailwind utilities;`);
    const css = tailwind.build([
      'bg-background',
      'text-primary-foreground',
      'border-input',
      'bg-session-open-gym-bg',
      'text-status-danger-fg',
      'rounded-lg',
      'font-sans',
    ]);
    expect(css).toMatch(/\.bg-background \{\s*background-color: var\(--background\);/);
    expect(css).toMatch(/\.text-primary-foreground \{\s*color: var\(--primary-foreground\);/);
    expect(css).toMatch(/\.border-input \{\s*border-color: var\(--input\);/);
    expect(css).toMatch(
      /\.bg-session-open-gym-bg \{\s*background-color: var\(--session-open-gym-bg\);/,
    );
    expect(css).toMatch(/\.text-status-danger-fg \{\s*color: var\(--status-danger-fg\);/);
    expect(css).toMatch(/\.rounded-lg \{\s*border-radius: var\(--radius\);/);
    expect(css).toMatch(/\.font-sans \{\s*font-family: var\(--th-font-family-text\);/);
  });

  it('AC1: generates spacing and radius constants for Swift and Kotlin, and Material 3 shapes', () => {
    const swift = output(swiftOutputs.layout);
    const swiftValues = (group: string) =>
      new Map(
        [
          ...(
            swift.match(new RegExp(`enum ${group} \\{([\\s\\S]*?)\\n    \\}`))?.[1] ?? ''
          ).matchAll(/public static let (\w+): CGFloat = (\d+)/g),
        ].map(([, name, value]) => [name, Number(value)]),
      );
    const kotlin = output(kotlinOutputs.layout);
    const kotlinValues = (group: string) =>
      new Map(
        [
          ...(
            kotlin.match(new RegExp(`object ${group} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? ''
          ).matchAll(/val (\w+): Dp = (\d+)\.dp/g),
        ].map(([, name, value]) => [name, Number(value)]),
      );

    // M0 draft values: the 4-based spacing scale and the M3 shape scale.
    const spacing = { space0: 0, space0_5: 2, space4: 16, space16: 64, gutter: 16, gutterWide: 24 };
    const radius = { none: 0, xs: 4, sm: 8, md: 12, lg: 16, xl: 28, full: 9999 };
    for (const [values, group, expected] of [
      [swiftValues, 'Spacing', spacing],
      [kotlinValues, 'Spacing', spacing],
      [swiftValues, 'Radius', radius],
      [kotlinValues, 'Radius', radius],
    ] as const) {
      const actual = values(group);
      expect(actual.size, group).toBe(group === 'Spacing' ? 14 : 7);
      for (const [name, value] of Object.entries(expected)) {
        expect(actual.get(name), `${group}.${name}`).toBe(value);
      }
    }

    expect(kotlinArguments(kotlin, 'TokenShapes')).toEqual(
      new Map([
        ['extraSmall', 'RoundedCornerShape(Radius.xs)'],
        ['small', 'RoundedCornerShape(Radius.sm)'],
        ['medium', 'RoundedCornerShape(Radius.md)'],
        ['large', 'RoundedCornerShape(Radius.lg)'],
        ['extraLarge', 'RoundedCornerShape(Radius.xl)'],
      ]),
    );
  });

  it('AC1: refuses a semantic colour without a dark value', async () => {
    const broken = { ...source, dark: withoutToken(source.dark, 'color.text.link') };
    await expect(renderOutputs(broken)).rejects.toThrow(TokenSourceError);
    await expect(renderOutputs(broken)).rejects.toThrow(
      'color.text.link has no dark value in tokens/color.dark.json',
    );
  });
});
