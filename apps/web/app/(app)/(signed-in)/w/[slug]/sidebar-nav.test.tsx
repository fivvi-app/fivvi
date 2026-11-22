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

/**
 * The links of the rendered navigation that carry `aria-current`, as `text=value`: `page` for the
 * page itself, `true` for a section that holds it.
 */
function current(html: string): string[] {
  return [
    ...html.matchAll(
      /<a[^>]*aria-current="(page|true)"[^>]*>(?:<svg.*?<\/svg>)?<span[^>]*>([^<]*)<\/span>/g,
    ),
  ].map(([, value, text]) => `${text ?? ''}=${value ?? ''}`);
}

// E020 #626: the sidebar shows where the person is (the prototype's `.on` row).
describe('E020 sidebar navigation', () => {
  it('marks the section of the page as the current page', () => {
    pathname = '/w/johns-gym/clients';
    const html = render('nl-NL', <SidebarNav label={label} items={items} />);

    expect(current(html)).toEqual(['Klanten=page']);
    expect(html).toContain(`aria-label="${label}"`);
  });

  it('keeps a section current on its sub-pages, but not as the page itself', () => {
    pathname = '/w/johns-gym/clients/abc';

    expect(current(render('nl-NL', <SidebarNav label={label} items={items} />))).toEqual([
      'Klanten=true',
    ]);
  });

  it('marks the section as holding the page, and the settings page the person is on as the page', () => {
    pathname = '/w/johns-gym/settings/language';

    expect(current(render('nl-NL', <SidebarNav label={label} items={items} />))).toEqual([
      'Instellingen=true',
      'Taal=page',
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

  it('F013: Persoonlijk is a group above the workspace, each under its heading, and Mijn dag is the current page on /me/day', () => {
    pathname = '/me/day';
    const html = render(
      'nl-NL',
      <SidebarNav
        label={label}
        items={items}
        heading="John's Gym"
        personal={{
          heading: 'Persoonlijk',
          items: [
            { href: '/me/day', label: 'Mijn dag', icon: 'day' },
            { href: '/me/calendar', label: 'Mijn agenda', icon: 'calendar' },
          ],
        }}
      />,
    );

    expect(current(html)).toEqual(['Mijn dag=page']);
    expect(html.indexOf('Persoonlijk')).toBeLessThan(html.indexOf('Mijn dag'));
    expect(html.indexOf('Mijn agenda')).toBeLessThan(html.indexOf('John&#x27;s Gym'));
    expect(html.indexOf('John&#x27;s Gym')).toBeLessThan(html.indexOf('Klanten'));
    expect(html).toContain('href="/me/calendar"');
  });

  it('F013 AC12: without a personal group there are no headings', () => {
    pathname = null;
    const html = render('nl-NL', <SidebarNav label={label} items={items} />);

    expect(html).not.toContain('Persoonlijk');
  });

  it('F013 AC9: each link is a touch-sized target on a phone (44 px) and compact from 768 px', () => {
    pathname = null;
    const html = render('nl-NL', <SidebarNav label={label} items={items} />);

    expect(html).toContain('h-11 md:h-8.5');
  });

  it('F014: the Dashboard is current on the workspace home only, not on every page below it', () => {
    const withDashboard = [
      { href: '/w/johns-gym', label: 'Dashboard', icon: 'today', exact: true },
      ...items,
    ] as const;
    pathname = '/w/johns-gym';
    expect(current(render('nl-NL', <SidebarNav label={label} items={withDashboard} />))).toEqual([
      'Dashboard=page',
    ]);

    pathname = '/w/johns-gym/clients';
    expect(current(render('nl-NL', <SidebarNav label={label} items={withDashboard} />))).toEqual([
      'Klanten=page',
    ]);
  });
});
