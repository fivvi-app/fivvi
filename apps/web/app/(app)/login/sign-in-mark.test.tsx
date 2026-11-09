import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, render } from '../../../test/render';
import { SignInForm } from './sign-in-form';
import { SignInMark } from './sign-in-mark';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

// E020 #626: the mark of the trainer web's sign-in (owner, 9 November 2026). The browser picks
// the file by width and colour scheme; the e2e test (sign-in-mark.spec.ts) checks the choice.
describe.each(locales)('E020 sign-in mark in %s', (locale) => {
  const copy = messages[locale];

  it('is one image named Fivvi: the wordmark from 768 px, the day dial below, each with a dark file', () => {
    const html = render(locale, <SignInMark />);

    expect(html.match(/<img/g)).toHaveLength(1);
    expect(html).toContain(`alt="${escapeHtml(copy.app.title)}"`);
    const sources = [...html.matchAll(/<source[^>]*media="([^"]*)"[^>]*srcSet="([^"]*)"/g)].map(
      ([, media, src]) => [media, src],
    );
    expect(sources).toEqual([
      [
        '(min-width: 768px) and (prefers-color-scheme: dark)',
        '/site-images/brand/fivvi-logo-dark.svg',
      ],
      ['(min-width: 768px)', '/site-images/brand/fivvi-logo.svg'],
      ['(prefers-color-scheme: dark)', '/site-images/brand/fivvi-day-dial-dark.svg'],
    ]);
    expect(html).toContain('src="/site-images/brand/fivvi-day-dial.svg"');
  });

  it('is on the sign-in form, and the placeholder letter is gone', () => {
    const html = render(locale, <SignInForm locale={locale} />);

    expect(html).toContain('/site-images/brand/fivvi-logo.svg');
    expect(html).not.toMatch(/>F<\//);
  });
});
