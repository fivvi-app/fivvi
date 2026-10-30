import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { escapeHtml, render } from '../../../../test/render';
import { MyProfile } from './my-profile';

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F003 TW-09 My profile in %s', (locale) => {
  const copy = messages[locale];

  it('AC9: lists each workspace with its role label under the heading My workspaces', () => {
    const html = render(
      locale,
      <MyProfile
        workspaces={[
          { workspaceId: 'w1', name: "John's Gym", slug: 'johns-gym', role: 'trainer' },
          { workspaceId: 'w2', name: 'Sarah Personal Training', slug: 'sarah', role: 'owner' },
        ]}
      />,
    );

    expect(html).toMatch(new RegExp(`<h1[^>]*>${escapeHtml(copy.myProfile.title)}</h1>`));
    expect(html).toContain(escapeHtml(copy.myProfile.workspacesTitle));
    expect(html).toMatch(
      new RegExp(`John&#x27;s Gym</span><span[^>]*>${escapeHtml(copy.roles.trainer)}<`),
    );
    expect(html).toMatch(
      new RegExp(`Sarah Personal Training</span><span[^>]*>${escapeHtml(copy.roles.owner)}<`),
    );
    expect(html).not.toContain('<button');
  });
});
