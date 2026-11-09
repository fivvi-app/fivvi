import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, render } from '../../../../../test/render';
import { WorkspaceSwitcher } from './workspace-switcher';

// The switcher navigates through the router, which exists only in a running app.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

const gym = { id: 'w1', name: "John's Gym", slug: 'johns-gym', role: 'trainer' } as const;
const personal = {
  id: 'w2',
  name: 'Sarah Personal Training',
  slug: 'sarah-personal-training',
  role: 'owner',
} as const;

// Opening it, picking a workspace, the keyboard and the remembered workspace are in
// e2e/workspace-switcher.spec.ts. Copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F012 scope switcher of the sidebar header in %s', (locale) => {
  const copy = messages[locale];

  it('AC1: with two workspaces the header is a closed menu button naming the workspace and the role', () => {
    const html = render(
      locale,
      <WorkspaceSwitcher
        name={gym.name}
        slug={gym.slug}
        teamRole="trainer"
        workspaces={[gym, personal]}
        canCreateWorkspace={false}
      />,
    );

    expect(html).toMatch(
      new RegExp(
        `<button[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"[^>]*><span>${escapeHtml(`John's Gym · ${copy.roles.trainer}`)}</span>`,
      ),
    );
  });

  it('AC3: one workspace and not on the allowlist: a plain label, no button', () => {
    const html = render(
      locale,
      <WorkspaceSwitcher
        name={gym.name}
        slug={gym.slug}
        teamRole="owner"
        workspaces={[gym]}
        canCreateWorkspace={false}
      />,
    );

    expect(html).toContain(escapeHtml(`John's Gym · ${copy.roles.owner}`));
    expect(html).not.toContain('<button');
    expect(html).not.toContain('aria-haspopup');
  });

  it('AC8: one workspace on the allowlist: still a menu button (its menu holds New workspace)', () => {
    const html = render(
      locale,
      <WorkspaceSwitcher
        name={gym.name}
        slug={gym.slug}
        teamRole="owner"
        workspaces={[gym]}
        canCreateWorkspace
      />,
    );

    expect(html).toMatch(/<button[^>]*aria-haspopup="menu"/);
  });
});
