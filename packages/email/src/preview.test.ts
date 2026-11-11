import { readFileSync } from 'node:fs';
import { locales } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { catalog, internalCatalog } from './catalog.ts';
import { previewEntries, previewResponse } from './preview.ts';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const active = [
  ...catalog.flatMap((entry) => (entry.status === 'active' ? [entry.template.id] : [])),
  ...internalCatalog.map((entry) => entry.template.id),
];

// Any email that is not built yet; whichever the catalog has left, so the test outlives the
// feature that activates one.
const reserved = (() => {
  const entry = catalog.find((candidate) => candidate.status === 'reserved');
  if (!entry) throw new Error('the catalog has no reserved entry to test the preview with');
  return entry;
})();

describe('AC7: the preview reads the catalog', () => {
  it('lists every catalog entry, active or not, with its ID and status', () => {
    const entries = previewEntries();
    for (const entry of catalog) {
      expect(entries.map((e) => e.label)).toContain(entry.id);
    }
    for (const entry of internalCatalog) {
      expect(entries.map((e) => e.label)).toContain(entry.key);
    }
    expect(entries.filter((e) => e.template).map((e) => e.template?.id)).toEqual(active);
    expect(entries.find((e) => e.label === reserved.id)?.status).toBe('reserved');
    expect(entries.find((e) => e.label === 'EM-01')?.status).toBe('retired');
  });

  it('AC7: shows every active email in both languages as HTML and as text, with synthetic data', async () => {
    for (const id of active) {
      for (const locale of locales) {
        const html = await previewResponse(`/${id}/${locale}`, {});
        expect(html.status, `${id} ${locale}`).toBe(200);
        expect(html.contentType).toContain('text/html');
        expect(html.body).toContain('<html');

        const text = await previewResponse(`/${id}/${locale}.txt`, {});
        expect(text.status, `${id} ${locale} text`).toBe(200);
        expect(text.contentType).toContain('text/plain');
        expect(text.body).toMatch(/^Subject: .+/);
      }
    }
  });

  it('AC7: the index links to every active email in both languages and names the reserved ones', async () => {
    const index = await previewResponse('/', {});
    expect(index.status).toBe(200);
    for (const id of active) {
      for (const locale of locales) {
        expect(index.body).toContain(`href="/${id}/${locale}"`);
        expect(index.body).toContain(`href="/${id}/${locale}.txt"`);
      }
    }
    expect(index.body).toContain(reserved.id);
    expect(index.body).not.toContain(`href="/${reserved.id}`);
  });

  it('answers 404 for an email or a language it does not have', async () => {
    expect((await previewResponse('/nope/en', {})).status).toBe(404);
    expect((await previewResponse('/sign-in/fr', {})).status).toBe(404);
    expect((await previewResponse('/sign-in', {})).status).toBe(404);
  });

  it('uses the time zone it is given', async () => {
    const amsterdam = await previewResponse('/hello/en.txt', {});
    const utc = await previewResponse('/hello/en.txt', { timeZone: 'UTC' });
    expect(amsterdam.body).not.toBe(utc.body);
  });

  it('AC7: never reads the database: no database, API or domain code in the preview', () => {
    const forbidden = /@fivvi\/(database|api|domain|auth)|drizzle|from 'pg'|DATABASE_URL/;
    expect(read('./preview.ts')).not.toMatch(forbidden);
    expect(read('../scripts/preview.ts')).not.toMatch(forbidden);
    const dependencies = JSON.parse(read('../package.json')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(dependencies.dependencies).filter((name) => forbidden.test(name))).toEqual(
      [],
    );
  });

  it('AC7: the preview command renders from the catalog, not from a list of its own', () => {
    const script = read('../scripts/preview.ts');
    expect(script).toContain("from '../src/preview.ts'");
    expect(script).not.toMatch(/templates\/|from '\.\.\/src\/templates/);
  });
});
