import { type Locale, locales, messages } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, render } from '../../../test/render';
import { ClientLanguageSwitch } from './client-language-switch';
import { ClientTabs } from './client-tabs';
import { ClientTitle } from './client-title';
import { NoWorkspace } from './no-workspace';

// Refreshing and the path need a running app; the clicks are in e2e/client-web.spec.ts.
let pathname: string | null = null;
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ refresh: () => {} }),
}));

describe.each(locales)('F030 the client web in %s', (locale) => {
  const copy = messages[locale];

  it('AC1: the tabs are Home, Boeken and Profiel, each a link, with no Activiteit before M7', () => {
    pathname = '/my';
    const html = render(locale, <ClientTabs />);

    expect(html).toContain(`aria-label="${escapeHtml(copy.clientNav.label)}"`);
    const links = [...html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g)].map(
      ([, href, inner]) => [href, inner?.replace(/<svg.*?<\/svg>/g, '').replace(/<[^>]+>/g, '')],
    );
    expect(links).toEqual([
      ['/my', escapeHtml(copy.clientNav.home)],
      ['/my/book', escapeHtml(copy.clientNav.book)],
      ['/my/profile', escapeHtml(copy.clientNav.profile)],
    ]);
  });

  it.each([
    ['/my', 'home'],
    ['/my/book', 'book'],
    ['/my/profile', 'profile'],
  ] as const)('AC1: on %s the tab %s is the current page, and no other', (path, tab) => {
    pathname = path;
    const html = render(locale, <ClientTabs />);

    const current = [...html.matchAll(/<a[^>]*aria-current="page"[^>]*>(.*?)<\/a>/g)].map(
      ([, inner]) => inner?.replace(/<svg.*?<\/svg>/g, '').replace(/<[^>]+>/g, ''),
    );
    expect(current).toEqual([escapeHtml(copy.clientNav[tab])]);
  });

  it('AC1: the header switch offers NL and EN, each named in its own language, and marks the current one', () => {
    const html = render(locale, <ClientLanguageSwitch />);

    expect(html).toContain(escapeHtml(copy.clientWeb.language.label));
    const buttons = [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map(
      ([, attrs, inner]) => ({
        attrs: attrs ?? '',
        // The text a screen reader reads: the visible label, then the hidden name.
        name: (inner ?? '').replace(/<[^>]+>/g, ''),
        visible: (inner ?? '').replace(/<span class="sr-only">.*?<\/span>/g, ''),
      }),
    );
    const { nlShort, nlName, enShort, enName } = copy.clientWeb.language;
    expect(buttons.map((b) => b.visible)).toEqual([nlShort, enShort]);
    expect(buttons.map((b) => b.attrs.includes('aria-pressed="true"'))).toEqual([
      locale === 'nl-NL',
      locale === 'en',
    ]);
    // WCAG 2.5.3 Label in Name: the accessible name has the visible text in it, and no aria-label
    // replaces it.
    expect(buttons.map((b) => b.name)).toEqual([`${nlShort} ${nlName}`, `${enShort} ${enName}`]);
    for (const b of buttons) expect(b.attrs).not.toContain('aria-label');
    expect(html).toContain('lang="nl"');
    expect(html).toContain('lang="en"');
  });

  // 14 January, 23:30 UTC is 00:30 on 15 January in Amsterdam: the date is the next day's. In
  // summer time 30 June, 22:30 UTC is 00:30 on 1 July.
  const dates: Record<Locale, [instant: string, date: string][]> = {
    'nl-NL': [
      ['2026-01-14T12:00:00Z', 'woensdag 14 januari'],
      ['2026-01-14T23:30:00Z', 'donderdag 15 januari'],
      ['2026-06-30T22:30:00Z', 'woensdag 1 juli'],
    ],
    en: [
      ['2026-01-14T12:00:00Z', 'Wednesday 14 January'],
      ['2026-01-14T23:30:00Z', 'Thursday 15 January'],
      ['2026-06-30T22:30:00Z', 'Wednesday 1 July'],
    ],
  };

  it.each(dates[locale])('AC1: the large title shows the date of %s as %s', (instant, date) => {
    const html = render(
      locale,
      <ClientTitle title={copy.clientNav.home} now={new Date(instant)} />,
    );

    expect(html).toContain(`>${escapeHtml(copy.clientNav.home)}</h1>`);
    // The date comes first, above the title.
    const shown = html.match(/<p[^>]*>([^<]+)<\/p>/)?.[1] ?? '';
    expect(shown).toBe(date);
    expect(html.indexOf(shown)).toBeLessThan(html.indexOf('<h1'));
  });

  it('AC1: with no workspace the home asks for the studio’s link, and says where to open it', () => {
    const html = render(locale, <NoWorkspace />);

    expect(html).toContain(escapeHtml(copy.noWorkspace.title));
    expect(html).toContain(escapeHtml(copy.clientWeb.noWorkspace.haveLink));
  });

  it('AC5: nothing on the no-workspace home creates a workspace', () => {
    const html = render(locale, <NoWorkspace />);

    expect(html).not.toContain('<form');
    expect(html).not.toContain('<button');
    expect(html).not.toContain(escapeHtml(copy.welcome.submit));
    expect(html).not.toContain('/welcome');
  });
});
