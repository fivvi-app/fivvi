import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, render } from '../../../test/render';
import { ClientHome } from './client-home';
import { ClientStudios } from './client-studios';
import { StudioMark } from './studio-mark';
import { AddStudio, StudiosList } from './studio-sheet';
import { StudioSwitcher } from './studio-switcher';

// The dialog itself (open, close, focus) needs a browser: e2e/client-studios.spec.ts.
let pathname: string | null = null;
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const studios = [
  { slug: 'fit-studio', name: 'Fit Studio' },
  { slug: 'johns-gym', name: "John's Gym" },
];

/** The text of a piece of HTML, without its tags and its decorative marks. */
const textOf = (html: string) =>
  html
    .replace(/<span[^>]*aria-hidden="true"[^>]*>.*?<\/span>/g, '')
    .replace(/<svg.*?<\/svg>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe.each(locales)('F030 the client’s studios in %s', (locale) => {
  const copy = messages[locale];

  it('AC6: the studio’s mark is its initials in a rounded square, hidden from screen readers', () => {
    const html = render(locale, <StudioMark name="Fit Studio" size="lg" />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-initials="FS"');
    expect(html).toContain('rounded-');
  });

  it('AC6: the home lists each studio by name under the title, as a link to that studio', () => {
    const html = render(locale, <ClientStudios studios={studios} />);

    expect(html).toContain(`>${escapeHtml(copy.clientWeb.studios.title)}</h2>`);
    const links = [...html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g)].map(
      ([, href, inner]) => [href, textOf(inner ?? '')],
    );
    expect(links).toEqual([
      ['/my/studio/fit-studio', 'Fit Studio'],
      ['/my/studio/johns-gym', escapeHtml("John's Gym")],
    ]);
    // The rows are a list, named by the title.
    expect(html).toMatch(/<section[^>]*aria-labelledby="([^"]+)"/);
    expect(html.match(/<li[ >]/g)).toHaveLength(2);
  });

  it('AC6: with a studio the home lists it, and not the no-studio text', () => {
    const html = render(locale, <ClientHome studios={[studios[1] as (typeof studios)[0]]} />);

    expect(html).toContain(escapeHtml("John's Gym"));
    expect(html).toContain(escapeHtml(copy.clientWeb.studios.title));
    expect(html).not.toContain(escapeHtml(copy.noWorkspace.title));
  });

  it('AC1: with no studio the home keeps the no-studio text and lists nothing', () => {
    const html = render(locale, <ClientHome studios={[]} />);

    expect(html).toContain(escapeHtml(copy.noWorkspace.title));
    expect(html).not.toContain(escapeHtml(copy.clientWeb.studios.title));
    expect(html).not.toContain('<a');
  });

  it('AC7: the switcher on Boeken shows the current studio’s mark and name, and opens a dialog', () => {
    pathname = '/my/book';
    const html = render(locale, <StudioSwitcher studios={studios} current="johns-gym" />);

    expect(html).toContain('data-initials="JG"');
    expect(html).toContain('aria-haspopup="dialog"');
    const button = html.match(/<button([^>]*)>(.*?)<\/button>/);
    expect(textOf(button?.[2] ?? '')).toBe(escapeHtml("John's Gym"));
    // WCAG 2.5.3 Label in Name: the accessible name has the visible name in it.
    const label = button?.[1]?.match(/aria-label="([^"]*)"/)?.[1] ?? '';
    expect(label).toContain(escapeHtml("John's Gym"));
  });

  it.each(['/my', '/my/profile', null])('AC7: the switcher is not on %s', (path) => {
    pathname = path;

    expect(render(locale, <StudioSwitcher studios={studios} current="johns-gym" />)).toBe('');
  });

  it('AC7: Je studio’s lists each studio, a check on the current one only', () => {
    const html = render(
      locale,
      <StudiosList studios={studios} current="johns-gym" onAdd={() => {}} />,
    );

    const rows = [...html.matchAll(/<a([^>]*)>(.*?)<\/a>/g)].map(([, attrs, inner]) => ({
      current: (attrs ?? '').includes('aria-current="true"'),
      href: attrs?.match(/href="([^"]*)"/)?.[1],
      text: textOf(inner ?? ''),
      hasCheck: (inner ?? '').includes('<svg'),
    }));
    expect(rows.map((r) => r.href)).toEqual(['/my/studio/fit-studio', '/my/studio/johns-gym']);
    expect(rows.map((r) => r.current)).toEqual([false, true]);
    expect(rows.map((r) => r.hasCheck)).toEqual([false, true]);
    // The check says what it is to a screen reader.
    expect(rows[1]?.text).toContain(escapeHtml(copy.clientWeb.studios.current));
    expect(rows[0]?.text).not.toContain(escapeHtml(copy.clientWeb.studios.current));
  });

  it('AC7: Studio toevoegen is a button that names the link and QR code, with no search', () => {
    const html = render(
      locale,
      <StudiosList studios={studios} current="johns-gym" onAdd={() => {}} />,
    );

    expect(html).toContain(escapeHtml(copy.clientWeb.studios.add));
    expect(html).toContain(escapeHtml(copy.clientWeb.studios.addHint));
    expect(html).not.toContain('<input');
    expect(html).not.toContain('type="search"');
    expect(html).not.toContain('role="search"');
  });

  it('AC7: adding a studio explains the link or QR code and offers no search or form', () => {
    const html = render(locale, <AddStudio />);

    expect(html).toContain(escapeHtml(copy.clientWeb.studios.addExplain));
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('type="search"');
  });

  it('AC7: adding a studio is centred under a plus mark, with a full-width ghost Klaar', () => {
    const html = render(locale, <AddStudio close={() => {}} />);

    // The prototype's `c-addws`: a centred column with the plus mark (`c-mark lg add`) on top.
    expect(html).toMatch(/^<div[^>]*class="[^"]*\btext-center\b/);
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>\s*<svg[^>]*aria-hidden="true"/);
    expect(html).toContain('size-[42px]');
    expect(html).toMatch(/<p[^>]*class="[^"]*\btext-\[15px\]/);
    const button = html.match(/<button([^>]*)>(.*?)<\/button>/);
    expect(button?.[2]).toBe(escapeHtml(copy.clientWeb.studios.done));
    expect(button?.[1]).toContain('hover:bg-muted');
    expect(button?.[1]).toContain('w-full');
    expect(button?.[1]).not.toContain('bg-secondary');
  });
});
