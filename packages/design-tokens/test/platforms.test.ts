import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { kotlinOutputs, renderOutputs, swiftOutputs } from '../src/build.ts';
import {
  readTokenSource,
  semanticColours,
  type TokenSource,
  type TokenTree,
  tokenPaths,
} from '../src/source.ts';
import { kotlinArguments, kotlinColours, nativeName, swiftColours } from './native.ts';

const packageRoot = path.resolve(import.meta.dirname, '..');

/** The colour roles of Compose Material 3's `ColorScheme` (`lightColorScheme` parameters). */
const materialRoles = [
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'inversePrimary',
  'secondary',
  'onSecondary',
  'secondaryContainer',
  'onSecondaryContainer',
  'tertiary',
  'onTertiary',
  'tertiaryContainer',
  'onTertiaryContainer',
  'background',
  'onBackground',
  'surface',
  'onSurface',
  'surfaceVariant',
  'onSurfaceVariant',
  'surfaceTint',
  'inverseSurface',
  'inverseOnSurface',
  'error',
  'onError',
  'errorContainer',
  'onErrorContainer',
  'outline',
  'outlineVariant',
  'scrim',
  'surfaceBright',
  'surfaceContainer',
  'surfaceContainerHigh',
  'surfaceContainerHighest',
  'surfaceContainerLow',
  'surfaceContainerLowest',
  'surfaceDim',
];

/** SwiftUI's `Font.TextStyle` cases: they scale with Dynamic Type. */
const iosTextStyles = [
  'largeTitle',
  'title',
  'title2',
  'title3',
  'headline',
  'subheadline',
  'body',
  'callout',
  'footnote',
  'caption',
  'caption2',
];

/** Compose Material 3's `Typography` roles: they scale with the user's font size. */
const androidTextStyles = ['display', 'headline', 'title', 'body', 'label'].flatMap((role) =>
  ['Large', 'Medium', 'Small'].map((size) => `${role}${size}`),
);

/** Roles left at Material's default: the scrim is black with alpha in both modes, not a token. */
const materialDefaults = ['scrim'];

describe('E007 design tokens platform mapping', () => {
  let source: TokenSource;
  let outputs: Map<string, string>;
  const output = (file: string) => outputs.get(file) ?? '';

  beforeAll(async () => {
    source = await readTokenSource(packageRoot);
    outputs = await renderOutputs(source);
  });

  it('AC4: every Material 3 role used is mapped in light and dark', () => {
    const schemes = output(kotlinOutputs.colorSchemes);
    expect(schemes).toMatch(/val LightColorScheme: ColorScheme = lightColorScheme\(/);
    expect(schemes).toMatch(/val DarkColorScheme: ColorScheme = darkColorScheme\(/);
    const light = kotlinArguments(schemes, 'LightColorScheme');
    const dark = kotlinArguments(schemes, 'DarkColorScheme');
    const colours = kotlinColours(output(kotlinOutputs.colors));

    // Every role but the documented defaults is set, so no Material baseline colour leaks in.
    expect([...light.keys()].sort()).toEqual(
      materialRoles.filter((role) => !materialDefaults.includes(role)).sort(),
    );
    expect([...dark.keys()].sort()).toEqual([...light.keys()].sort());

    for (const [role, value] of light) {
      const token = value.match(/^LightTokenColors\.(\w+)$/)?.[1];
      expect(token, `${role} light is a token`).toBeDefined();
      expect(dark.get(role), `${role} dark is the same token`).toBe(`DarkTokenColors.${token}`);
      expect(colours.light.get(token ?? ''), `${role} light`).toMatch(/^#[0-9A-F]{6}$/);
      expect(colours.dark.get(token ?? ''), `${role} dark`).toMatch(/^#[0-9A-F]{6}$/);
    }
    // The roles the token descriptions name.
    expect(light.get('primary')).toBe(`LightTokenColors.${nativeName('color.action.primary.bg')}`);
    expect(light.get('onPrimary')).toBe(
      `LightTokenColors.${nativeName('color.action.primary.fg')}`,
    );
    expect(light.get('surface')).toBe(`LightTokenColors.${nativeName('color.bg.canvas')}`);
    expect(light.get('secondaryContainer')).toBe(
      `LightTokenColors.${nativeName('color.action.tonal.bg')}`,
    );
    expect(light.get('error')).toBe(`LightTokenColors.${nativeName('color.action.danger.bg')}`);
    expect(light.get('outline')).toBe(`LightTokenColors.${nativeName('color.border.control')}`);
  });

  it('Material 3 content roles sit on their container as a declared contrast pair', () => {
    const light = kotlinArguments(output(kotlinOutputs.colorSchemes), 'LightColorScheme');
    const tokenOf = new Map(
      source.pairs.flatMap((pair) => [pair.fg, pair.bg]).map((token) => [nativeName(token), token]),
    );
    const token = (role: string) =>
      tokenOf.get(light.get(role)?.replace('LightTokenColors.', '') ?? '');
    const declared = (a?: string, b?: string) =>
      source.pairs.some(
        (pair) => (pair.fg === a && pair.bg === b) || (pair.fg === b && pair.bg === a),
      );

    const contentRoles = [...light.keys()].filter((role) => /^(on|inverseOn)[A-Z]/.test(role));
    expect(contentRoles.length).toBeGreaterThanOrEqual(10);
    for (const role of contentRoles) {
      const container =
        role === 'inverseOnSurface'
          ? 'inverseSurface'
          : `${role.charAt(2).toLowerCase()}${role.slice(3)}`;
      expect(declared(token(role), token(container)), `${role} on ${container}`).toBe(true);
    }
    expect(declared(token('inversePrimary'), token('inverseSurface')), 'inversePrimary').toBe(true);
  });

  it('AC4: every iOS colour is adaptive', () => {
    const colors = output(swiftOutputs.colors);
    const members = [...colors.matchAll(/public static let (\w+)/g)].map(([, name]) => name);
    const adaptive = swiftColours(colors);
    expect(members.sort()).toEqual(semanticColours(source).map(nativeName).sort());
    expect([...adaptive.keys()].sort()).toEqual(members);
    // A colour that changes with the appearance proves the dark value is used.
    expect(adaptive.get(nativeName('color.bg.canvas'))).toEqual({
      light: '#F6F6F7',
      dark: '#242428',
    });

    // Color(light:dark:) resolves per appearance through the system's dynamic colour providers.
    const tokens = output(swiftOutputs.tokens);
    expect(tokens).toMatch(/init\(light: UInt32, dark: UInt32\)/);
    expect(tokens).toMatch(
      /UIColor \{ traits in\s+UIColor\(rgb: traits\.userInterfaceStyle == \.dark \? dark : light\)/,
    );
    expect(tokens).toMatch(
      /NSColor\(name: nil\) \{ appearance in\s+NSColor\(rgb: appearance\.bestMatch\(from: \[\.aqua, \.darkAqua\]\) == \.darkAqua \? dark : light\)/,
    );
  });

  it('AC4: no fixed native font sizes', () => {
    const native = [...Object.values(swiftOutputs), ...Object.values(kotlinOutputs)].map(output);
    for (const code of native) {
      expect(code).not.toMatch(/size:|\.sp\b|fontSize|TextUnit|Font\.custom|\.system\(size/i);
    }

    // Every type style maps to a platform text style, so Dynamic Type and font scaling apply.
    const styles = tokenPaths(source.light).filter((p) => /^typography\.[\w-]+$/.test(p));
    expect(styles).toContain('typography.numeric-xl');
    const swift = new Map(
      [
        ...output(swiftOutputs.typography).matchAll(
          /public static let (\w+): Font\.TextStyle = \.(\w+)/g,
        ),
      ].map(([, name, style]) => [name, style]),
    );
    const kotlin = new Map(
      [
        ...output(kotlinOutputs.typography).matchAll(
          /val Typography\.(\w+): TextStyle\s+get\(\) = (\w+)/g,
        ),
      ].map(([, name, style]) => [name, style]),
    );
    expect([...swift.keys()].sort()).toEqual(styles.map(nativeName).sort());
    expect([...kotlin.keys()].sort()).toEqual(styles.map(nativeName).sort());
    for (const style of swift.values()) expect(iosTextStyles).toContain(style);
    for (const style of kotlin.values()) expect(androidTextStyles).toContain(style);
    expect(swift.get('body')).toBe('body');
    expect(kotlin.get('body')).toBe('bodyLarge');
    expect(swift.get('numericXl')).toBe('largeTitle');
    expect(kotlin.get('numericXl')).toBe('displaySmall');

    // The token source names native text styles only as mapping notes, never as sizes.
    const notes = JSON.stringify(
      styles.map((style) => {
        let node: unknown = source.light;
        for (const key of style.split('.')) node = (node as TokenTree)[key];
        return (node as TokenTree).$extensions;
      }),
    );
    expect(notes).not.toMatch(/size|\d+\s*(pt|sp|dp|px)\b/i);
  });
});
