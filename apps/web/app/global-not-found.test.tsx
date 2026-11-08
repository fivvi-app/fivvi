import { messages } from '@fivvi/i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../test/render';
import GlobalNotFound, { metadata } from './global-not-found';

describe('F064 the 404 page of an address that matches no page', () => {
  it('says it in both languages, each marked with its own lang, so nobody reads English by default', () => {
    const html = renderToStaticMarkup(<GlobalNotFound />);

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

  it('is a whole document of its own, as it bypasses every layout', () => {
    const html = renderToStaticMarkup(<GlobalNotFound />);

    expect(html).toMatch(/^<html lang="nl-NL"/);
    expect(html).toContain('<body');
    expect(metadata.title).toContain(messages['nl-NL'].notFound.title);
    expect(metadata.title).toContain(messages.en.notFound.title);
  });
});
