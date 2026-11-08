import path from 'node:path';
import { compile } from 'tailwindcss';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  clientColours,
  kotlinOutputs,
  renderOutputs,
  shadcnColours,
  swiftOutputs,
  webOutputs,
} from '../src/build.ts';
import {
  isWebOnly,
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
    // The web-only colours (zinc for the trainer web, the client web's glass) are not native.
    const colours = semanticColours(source).filter((colour) => !isWebOnly(colour));
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
    // v2 values, resolved through the palette and the mixes in each mode.
    expect(swift.get('actionPrimaryBgPressed')).toEqual({ light: '#B90F3A', dark: '#B90F3A' });
    expect(swift.get('accentText')).toEqual({ light: '#C8103D', dark: '#FF6482' });
    expect(kotlin.dark.get('bgCanvas')).toBe('#000000');
  });

  it('AC1: CSS variables have a light and a dark value for every semantic colour', () => {
    const colours = semanticColours(source);
    for (const group of ['bg', 'text', 'border', 'action', 'status', 'session']) {
      expect(colours.some((colour) => colour.startsWith(`color.${group}.`))).toBe(true);
    }

    const { light, dark } = customProperties(output(webOutputs.tokens));
    // Opaque hex everywhere text sits; only the client web's glass surfaces carry alpha.
    const glass = /^color\.web\.glass\./;
    for (const colour of colours) {
      const expected = glass.test(colour) ? /^rgba\(/ : hex;
      expect(light.get(cssName(colour)), `${colour} light`).toMatch(expected);
      expect(dark.get(cssName(colour)), `${colour} dark`).toMatch(expected);
    }
    // v2 values, resolved through the palette and the mixes in each mode.
    expect(light.get('--th-color-bg-canvas')?.toUpperCase()).toBe('#F2F2F7');
    expect(dark.get('--th-color-bg-canvas')?.toUpperCase()).toBe('#000000');
    expect(dark.get('--th-color-action-tonal-bg')?.toUpperCase()).toBe('#2E2E32');
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
    expect(resolveVar('--primary', properties.dark)?.toUpperCase()).toBe('#E6164A');
    expect(resolveVar('--background', properties.light)?.toUpperCase()).toBe('#FFFFFF');
    expect(resolveVar('--background', properties.dark)?.toUpperCase()).toBe('#09090B');
    expect(resolveVar('--radius', properties.light)).toBe('12px');
  });

  it("AC1: the client web's theme sets the same variables to the Fivvi Pro values, under data-theme", () => {
    const css = output(webOutputs.client);
    const block = css.match(/\[data-theme="client"\] \{([\s\S]*?)\n\}/)?.[1] ?? '';
    const properties = customProperties(output(webOutputs.tokens), `:root {${block}}`);
    expect(css).not.toContain(':root');
    expect(Object.keys(clientColours).sort()).toEqual(Object.keys(shadcnColours).sort());
    for (const [name, token] of Object.entries(clientColours)) {
      for (const mode of ['light', 'dark'] as const) {
        expect(resolveVar(`--${name}`, properties[mode]), `--${name} ${mode}`).toBe(
          resolveVar(cssName(token), properties[mode]),
        );
      }
    }
    expect(resolveVar('--background', properties.light)?.toUpperCase()).toBe('#F2F2F7');
    expect(resolveVar('--background', properties.dark)?.toUpperCase()).toBe('#000000');
    expect(resolveVar('--muted-foreground', properties.light)?.toUpperCase()).toBe('#6C6C70');
    expect(resolveVar('--radius', properties.light)).toBe('26px');
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

  it('AC11: the Tailwind theme sets font-numeric to the numeric token, body text to the text token, and has no display face', async () => {
    const tailwind = await compile(`${output(webOutputs.theme)}\n@tailwind utilities;`);
    const css = tailwind.build(['font-numeric', 'font-sans', 'font-display']);
    expect(css).toMatch(/\.font-numeric \{\s*font-family: var\(--th-font-family-numeric\);/);
    expect(css).toMatch(/\.font-sans \{\s*font-family: var\(--th-font-family-text\);/);
    expect(css).not.toContain('font-display');
    expect(
      customProperties(output(webOutputs.tokens)).light.get('--th-font-family-numeric'),
    ).toMatch(/^ui-rounded,/);
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

    // The 4-based spacing scale and the M3 shape scale; the card is 26 on iOS and 28 on Android.
    const spacing = { space0: 0, space0_5: 2, space4: 16, space16: 64, gutter: 16, gutterWide: 24 };
    const radius = { none: 0, xs: 4, sm: 8, md: 12, lg: 16, xl: 28, full: 9999 };
    for (const [values, group, expected] of [
      [swiftValues, 'Spacing', spacing],
      [kotlinValues, 'Spacing', spacing],
      [swiftValues, 'Radius', { ...radius, card: 26 }],
      [kotlinValues, 'Radius', { ...radius, card: 28 }],
    ] as const) {
      const actual = values(group);
      expect(actual.size, group).toBe(group === 'Spacing' ? 14 : 8);
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
