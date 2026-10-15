import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { kotlinOutputs, renderOutputs } from '../src/build.ts';
import { readTokenSource, type TokenSource } from '../src/source.ts';
import { kotlinArguments, kotlinColours, nativeName } from './native.ts';

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
    expect(light.get('onPrimary')).toBe(`LightTokenColors.${nativeName('color.action.primary.fg')}`);
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
    expect(declared(token('inversePrimary'), token('inverseSurface')), 'inversePrimary').toBe(
      true,
    );
  });
});
