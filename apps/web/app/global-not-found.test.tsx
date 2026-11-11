import { messages } from '@fivvi/i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml } from '../test/render';
import GlobalNotFound, { metadata } from './global-not-found';

// `connection()` only works inside a request; a unit test has none.
const request = vi.hoisted(() => ({ connection: vi.fn(() => Promise.resolve()) }));
vi.mock('next/server', () => request);

describe('F064 the 404 page of an address that matches no page', () => {
  it('says it in both languages, each marked with its own lang, so nobody reads English by default', async () => {
    const html = renderToStaticMarkup(await GlobalNotFound());

    for (const [lang, { notFound }] of [
      ['nl-NL', messages['nl-NL']],
      ['en', messages.en],
    ] as const) {
      expect(html).toContain(`lang="${lang}"`);
      expect(html).toContain(escapeHtml(notFound.title));
      expect(html).toContain(escapeHtml(notFound.body));
    }
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
  });

  it('is a whole document of its own, as it bypasses every layout', async () => {
    const html = renderToStaticMarkup(await GlobalNotFound());

    expect(html).toMatch(/^<html lang="nl-NL"/);
    expect(html).toContain('<body');
    expect(metadata.title).toContain(messages['nl-NL'].notFound.title);
    expect(metadata.title).toContain(messages.en.notFound.title);
  });

  it('waits for the request, so it renders with the nonce of the Content-Security-Policy (E013)', async () => {
    request.connection.mockClear();

    await GlobalNotFound();

    expect(request.connection).toHaveBeenCalledOnce();
  });
});
