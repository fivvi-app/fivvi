import { messages } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { render } from '../../../../../test/render';
import { SidebarNav } from './sidebar-nav';

const label = messages['nl-NL'].workspaceNav.label;
let pathname: string | null = null;
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const items = [
  { href: '/w/johns-gym/clients', label: 'Klanten', icon: 'clients' },
  { href: '/w/johns-gym/trainers', label: 'Trainers', icon: 'trainers' },
  {
    href: '/w/johns-gym/settings/general',
    base: '/w/johns-gym/settings',
    label: 'Instellingen',
    icon: 'settings',
    children: [
      { href: '/w/johns-gym/settings/general', label: 'Algemeen' },
      { href: '/w/johns-gym/settings/language', label: 'Taal' },
    ],
  },
] as const;

/** The links of the rendered navigation that are marked as the current page, by their text. */
function current(html: string): string[] {
  return [
    ...html.matchAll(
      /<a[^>]*aria-current="page"[^>]*>(?:<svg.*?<\/svg>)?<span[^>]*>([^<]*)<\/span>/g,
    ),
  ].map(([, text]) => text ?? '');
}

// E020 #626: the sidebar shows where the person is (the prototype's `.on` row).
describe('E020 sidebar navigation', () => {
  it('marks the section of the page as the current page', () => {
    pathname = '/w/johns-gym/clients';
    const html = render('nl-NL', <SidebarNav label={label} items={items} />);

    expect(current(html)).toEqual(['Klanten']);
    expect(html).toContain(`aria-label="${label}"`);
  });

  it('keeps a section current on its sub-pages', () => {
    pathname = '/w/johns-gym/clients/abc';

    expect(current(render('nl-NL', <SidebarNav label={label} items={items} />))).toEqual([
      'Klanten',
    ]);
  });

  it('marks both Settings and the settings page the person is on', () => {
    pathname = '/w/johns-gym/settings/language';

    expect(current(render('nl-NL', <SidebarNav label={label} items={items} />))).toEqual([
      'Instellingen',
      'Taal',
    ]);
  });

  it('marks nothing when the page is none of them, or not known', () => {
    pathname = '/w/johns-gym';
    expect(current(render('nl-NL', <SidebarNav label={label} items={items} />))).toEqual([]);
    pathname = null;
    expect(current(render('nl-NL', <SidebarNav label={label} items={items} />))).toEqual([]);
  });

  it('draws an icon for each section, hidden from screen readers', () => {
    pathname = null;
    const html = render('nl-NL', <SidebarNav label={label} items={items} />);

    expect(html.match(/<svg[^>]*aria-hidden="true"/g)).toHaveLength(3);
  });
});
