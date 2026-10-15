/**
 * Swift and Kotlin identifier of a colour or type style: its path without the group, in lower
 * camel case (`color.action.primary.bg-pressed` → `actionPrimaryBgPressed`). Spacing and radius
 * names, which can start with a digit, are asserted as literals instead.
 */
export function nativeName(tokenPath: string): string {
  const [, ...rest] = tokenPath.split('.');
  const words = rest.join('-').split('-');
  return words
    .map((word, index) => (index === 0 ? word : `${word[0]?.toUpperCase()}${word.slice(1)}`))
    .join('');
}

const hex = (value: string) => `#${value.slice(-6).toUpperCase()}`;

/** `Tokens.Colors` in the generated Swift: name → light and dark `#RRGGBB`. */
export function swiftColours(swift: string): Map<string, { light: string; dark: string }> {
  const colour = /static let (\w+) = Color\(light: 0x([0-9A-F]{6}), dark: 0x([0-9A-F]{6})\)/g;
  return new Map(
    [...swift.matchAll(colour)].map(([, name = '', light = '', dark = '']) => [
      name,
      { light: hex(light), dark: hex(dark) },
    ]),
  );
}

/** Arguments of `val <name> ... = <call>(` … `)` in generated Kotlin, as name → expression. */
export function kotlinArguments(kotlin: string, name: string): Map<string, string> {
  const block = kotlin.match(new RegExp(`val ${name}\\b[^=]*= \\w+\\(\\n([\\s\\S]*?)\\n\\)`))?.[1];
  if (block === undefined) return new Map();
  return new Map(
    [...block.matchAll(/^\s*(\w+) = (.+?),?$/gm)].map(([, key = '', value = '']) => [key, value]),
  );
}

/** `LightTokenColors` and `DarkTokenColors` in the generated Kotlin: name → `#RRGGBB`. */
export function kotlinColours(kotlin: string): Record<'light' | 'dark', Map<string, string>> {
  const colours = (name: string) =>
    new Map(
      [...kotlinArguments(kotlin, name)].map(([key, value]) => [
        key,
        hex(value.match(/^Color\(0xFF([0-9A-F]{6})\)$/)?.[1] ?? value),
      ]),
    );
  return { light: colours('LightTokenColors'), dark: colours('DarkTokenColors') };
}
