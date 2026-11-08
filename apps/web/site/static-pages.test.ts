import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const siteDir = path.resolve(import.meta.dirname, '../app/(site)');

/** Every file named `name` below `directory`. */
function filesNamed(name: string, directory = siteDir): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesNamed(name, file);
    return entry.name === name ? [file] : [];
  });
}

describe('F064 the site is static (ADR-030)', () => {
  it('every root layout of the site makes the build fail when a page reads the request', () => {
    const layouts = filesNamed('layout.tsx');
    // One per language.
    expect(layouts.length).toBeGreaterThanOrEqual(2);

    const notStatic = layouts.filter(
      (file) => !/^export const dynamic = 'error';$/m.test(readFileSync(file, 'utf8')),
    );

    expect(notStatic.map((file) => path.relative(siteDir, file))).toEqual([]);
  });

  it('no page or layout of the site opts back into dynamic rendering or reads the request', () => {
    const offending = [...filesNamed('layout.tsx'), ...filesNamed('page.tsx')].filter((file) =>
      /next\/headers|cookies\(|headers\(|searchParams|force-dynamic|revalidate\s*=\s*0|currentLocale/.test(
        readFileSync(file, 'utf8'),
      ),
    );

    expect(offending.map((file) => path.relative(siteDir, file))).toEqual([]);
  });
});
