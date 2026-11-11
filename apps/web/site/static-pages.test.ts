import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const siteDir = path.resolve(import.meta.dirname, '../app/(site)');
/** The components, helpers and page bodies the site's routes render. */
const siteSourceDir = import.meta.dirname;

/** Every file below `directory` whose name `matches`. */
function filesBelow(matches: (name: string) => boolean, directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesBelow(matches, file);
    return matches(entry.name) ? [file] : [];
  });
}

/** Every file named `name` below the site's routes. */
const filesNamed = (name: string) => filesBelow((entry) => entry === name, siteDir);

/** The non-test sources of `apps/web/site`: what the site's pages render. */
const siteSources = () =>
  filesBelow((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name), siteSourceDir);

/**
 * What reads the request, which would make a page differ per visitor or set a cookie: the request
 * APIs of Next.js, the search parameters, a forced dynamic or uncached page, and the visitor's
 * language (`currentLocale`).
 */
const READS_THE_REQUEST =
  /next\/headers|cookies\(|headers\(|searchParams|force-dynamic|revalidate\s*=\s*0|currentLocale/;

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

  it('no page, layout or component of the site reads the request', () => {
    const files = [...filesNamed('layout.tsx'), ...filesNamed('page.tsx'), ...siteSources()];
    // The components of the site are there to be scanned.
    expect(files.some((file) => file.endsWith('site-header.tsx'))).toBe(true);
    expect(files.some((file) => file.endsWith('demo-form.tsx'))).toBe(true);

    const offending = files.filter((file) => READS_THE_REQUEST.test(readFileSync(file, 'utf8')));

    expect(offending.map((file) => path.relative(siteSourceDir, file))).toEqual([]);
  });

  it.each([
    "import { cookies } from 'next/headers';",
    'const jar = await cookies();',
    'const list = await headers();',
    'export default function Page({ searchParams }) {}',
    "export const dynamic = 'force-dynamic';",
    'export const revalidate = 0;',
    'const locale = currentLocale();',
  ])('the check catches `%s`', (source) => {
    expect(READS_THE_REQUEST.test(source)).toBe(true);
  });

  it('the check lets a plain component pass', () => {
    expect(READS_THE_REQUEST.test('export function SiteFooter() { return null; }')).toBe(false);
  });
});
