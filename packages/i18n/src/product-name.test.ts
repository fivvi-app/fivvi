import { describe, expect, it } from 'vitest';
import { locales, messages } from './index.ts';

/** Every message of a catalog as `key → text`, nested keys joined by dots. */
function flatten(node: unknown, prefix = ''): [string, string][] {
  if (typeof node === 'string') return [[prefix, node]];
  return Object.entries(node as object).flatMap(([key, value]) =>
    flatten(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe.each(locales)('The product name in %s', (locale) => {
  const catalog = messages[locale];

  it('names the web app Fivvi', () => {
    expect(catalog.app.title).toBe('Fivvi');
  });

  it('names the native trainer app Fivvi Pro', () => {
    expect(catalog.app.name).toBe('Fivvi Pro');
  });

  it('never uses the old working name', () => {
    const used = flatten(catalog).filter(([, text]) => /trainer\s?hub/i.test(text));
    expect(used).toEqual([]);
  });

  it('signs the emails as Fivvi', () => {
    expect(catalog.email.layout.footer).toContain('Fivvi');
    expect(catalog.email.hello.subject).toContain('Fivvi');
  });
});
