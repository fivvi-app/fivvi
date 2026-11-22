import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { render } from '../../../../../test/render';
import { ScopeToggle } from './scope-toggle';

// F014 (spec #458, ticket #532): the toggle *Mijn dag | {workspace}* is on both sides, as in the
// prototype: the Owner's Dashboard and their own day (*Mijn dag*).
describe.each(locales)('F014 the Mijn dag toggle in %s', (locale) => {
  const copy = messages[locale];
  const links = (html: string) =>
    [...html.matchAll(/<a([^>]*)>([^<]*)<\/a>/g)].map(([, attributes, name]) => ({
      name,
      href: /href="([^"]*)"/.exec(attributes ?? '')?.[1],
      current: /aria-current="page"/.test(attributes ?? ''),
    }));

  it('on the Dashboard the workspace is the current page and Mijn dag opens /me/day', () => {
    const html = render(
      locale,
      <ScopeToggle current="workspace" slug="pilot-gym" workspace="Pilot Gym" />,
    );

    expect(html).toContain(`aria-label="${copy.workspaceDashboard.scopeLabel}"`);
    expect(links(html)).toEqual([
      { name: copy.workspaceNav.myDay, href: '/me/day', current: false },
      { name: 'Pilot Gym', href: '/w/pilot-gym', current: true },
    ]);
  });

  it('on Mijn dag that is the current page and the workspace opens its Dashboard', () => {
    const html = render(
      locale,
      <ScopeToggle current="me" slug="pilot-gym" workspace="Pilot Gym" />,
    );

    expect(links(html)).toEqual([
      { name: copy.workspaceNav.myDay, href: '/me/day', current: true },
      { name: 'Pilot Gym', href: '/w/pilot-gym', current: false },
    ]);
  });
});
