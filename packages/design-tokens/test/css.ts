import type { Mode } from '../src/source.ts';

const darkBlock = /@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n\}/g;
const declaration = /(--[\w-]+):\s*([^;]+);/g;

function declarations(css: string): Map<string, string> {
  return new Map(
    [...css.matchAll(declaration)].map(([, name, value]) => [name ?? '', value ?? '']),
  );
}

/**
 * The custom properties the browser sees on `:root` in each mode: light is everything outside
 * the `prefers-color-scheme: dark` block, dark is light overridden by that block.
 */
export function customProperties(...files: string[]): Record<Mode, Map<string, string>> {
  const css = files.join('\n');
  const light = declarations(css.replace(darkBlock, ''));
  const dark = new Map([
    ...light,
    ...[...css.matchAll(darkBlock)].flatMap(([, block]) => [...declarations(block ?? '')]),
  ]);
  return { light, dark };
}

/** Follows `var(--x)` references until a literal value; undefined when a variable is missing. */
export function resolveVar(name: string, properties: Map<string, string>): string | undefined {
  const value = properties.get(name);
  const reference = value?.match(/^var\((--[\w-]+)\)$/)?.[1];
  return reference ? resolveVar(reference, properties) : value;
}
