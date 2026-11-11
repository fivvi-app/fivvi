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

describe('F064 the site reads no request, but renders per request for the nonce (ADR-030, E013 AC8)', () => {
  // A page cannot get the nonce of its Content-Security-Policy at build time: Next.js puts it on its
  // own inline scripts while it renders a request. So the root layout of each language waits for
  // the request (`connection()`), which makes the site's pages render per request. It reads
  // nothing from the request: the pages are the same for every visitor, and set no cookie.
  it('every root layout of the site waits for the request, so its pages get the nonce', () => {
    const layouts = filesNamed('layout.tsx');
    // One per language.
    expect(layouts.length).toBeGreaterThanOrEqual(2);

    const notPerRequest = layouts.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return !(
        /import \{ connection \} from 'next\/server';/.test(source) &&
        /await connection\(\);/.test(source)
      );
    });

    expect(notPerRequest.map((file) => path.relative(siteDir, file))).toEqual([]);
  });

  it('no page or layout of the site reads the request', () => {
    const offending = [...filesNamed('layout.tsx'), ...filesNamed('page.tsx')].filter((file) =>
      /next\/headers|cookies\(|headers\(|searchParams|force-dynamic|revalidate\s*=\s*0|currentLocale/.test(
        readFileSync(file, 'utf8'),
      ),
    );

    expect(offending.map((file) => path.relative(siteDir, file))).toEqual([]);
  });
});
