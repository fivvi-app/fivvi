import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, render } from '../../../../test/render';
import { MyProfile } from './my-profile';

// The form refreshes the page through the router, which exists only in a running app.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

// Saving is in e2e/profile.spec.ts. Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F003 TW-09 My profile in %s', (locale) => {
  const copy = messages[locale];

  it('AC9: lists each workspace with its role label under the heading My workspaces', () => {
    const html = render(
      locale,
      <MyProfile
        name="Sarah"
        email="sarah@example.com"
        workspaces={[
          {
            workspaceId: 'w1',
            name: "John's Gym",
            slug: 'johns-gym',
            role: 'trainer',
            capabilities: [],
          },
          {
            workspaceId: 'w2',
            name: 'Sarah Personal Training',
            slug: 'sarah',
            role: 'owner',
            capabilities: [],
          },
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
    // No switching (F012): the workspaces section holds no button.
    expect(html.split(copy.myProfile.workspacesTitle)[1]).not.toContain('<button');
  });

  it('AC1: shows the name in an editable field with Save, and the email address read-only', () => {
    const html = render(
      locale,
      <MyProfile name="Sarah de Vries" email="sarah@example.com" workspaces={[]} />,
    );

    expect(html).toMatch(new RegExp(`<label[^>]*>${escapeHtml(copy.myProfile.nameLabel)}</label>`));
    expect(html).toMatch(/<input[^>]*name="name"[^>]*value="Sarah de Vries"/);
    expect(html).toMatch(
      new RegExp(`<button[^>]*type="submit"[^>]*>${escapeHtml(copy.myProfile.save)}</button>`),
    );
    expect(html).toMatch(
      new RegExp(
        `<dt[^>]*>${escapeHtml(copy.myProfile.emailLabel)}</dt><dd[^>]*>sarah@example.com</dd>`,
      ),
    );
    expect(html).not.toMatch(/<input[^>]*sarah@example\.com/);
    expect(html).not.toContain('role="alert"');
  });

  it('AC1: a person without a name yet gets an empty field', () => {
    const html = render(
      locale,
      <MyProfile name={null} email="sarah@example.com" workspaces={[]} />,
    );

    expect(html).toMatch(/<input[^>]*name="name"[^>]*value=""/);
  });
});
