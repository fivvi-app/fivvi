import { locales, messages } from '@fivvi/i18n';
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
    const button = (short: string, name: string, pressed: boolean) =>
      new RegExp(
        `<button[^>]*aria-pressed="${pressed}"[^>]*aria-label="${name}"[^>]*>${short}</button>|<button[^>]*aria-label="${name}"[^>]*aria-pressed="${pressed}"[^>]*>${short}</button>`,
      );
    expect(html).toMatch(
      button(copy.clientWeb.language.nlShort, copy.clientWeb.language.nlName, locale === 'nl-NL'),
    );
    expect(html).toMatch(
      button(copy.clientWeb.language.enShort, copy.clientWeb.language.enName, locale === 'en'),
    );
  });

  it('AC1: the large title has the date above it, in the language of the page', () => {
    const html = render(locale, <ClientTitle title={copy.clientNav.home} />);

    expect(html).toContain(`<h1`);
    expect(html).toContain(`>${escapeHtml(copy.clientNav.home)}</h1>`);
    // The date comes first: a weekday, a day number and a month, in the page's language.
    const date = html.match(/<p[^>]*>([^<]+)<\/p>/)?.[1] ?? '';
    expect(html.indexOf(date)).toBeLessThan(html.indexOf('<h1'));
    expect(date).toMatch(/\d/);
    const weekdays =
      locale === 'nl-NL'
        ? /maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag/
        : /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/;
    expect(date).toMatch(weekdays);
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
