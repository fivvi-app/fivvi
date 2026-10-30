import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, render } from '../../../../test/render';
import { UserMenu } from './user-menu';
import { WorkspaceFrame } from './workspace-frame';

// The menu refreshes the page through the router, which exists only in a running app.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

// Opening it and choosing a language are in e2e/language.spec.ts. Copy is read from the
// catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F010 user menu of the workspace frame in %s', (locale) => {
  const copy = messages[locale].userMenu;

  it('AC1: the frame has a closed user menu button with an accessible name', () => {
    const html = render(
      locale,
      <WorkspaceFrame name="John's Gym" slug="johns-gym" teamRole="trainer" personName={null}>
        <hr />
      </WorkspaceFrame>,
    );

    expect(html).toMatch(
      new RegExp(
        `<button[^>]*aria-label="${escapeHtml(copy.label)}"[^>]*aria-expanded="false"[^>]*>`,
      ),
    );
    expect(html).not.toContain(copy.languageNl);
  });

  it('F005 AC1: the sidebar footer shows the name as entered', () => {
    const html = render(
      locale,
      <WorkspaceFrame
        name="John's Gym"
        slug="johns-gym"
        teamRole="trainer"
        personName="Sarah de Vries"
      >
        <hr />
      </WorkspaceFrame>,
    );

    expect(html).toMatch(/<footer[^>]*>[\s\S]*Sarah de Vries[\s\S]*<\/footer>/);
  });

  it('F003: the opened menu links to My profile', () => {
    const html = render(locale, <UserMenu initiallyOpen />);

    expect(html).toMatch(
      new RegExp(`<a[^>]*href="/me/profile"[^>]*>${escapeHtml(copy.profile)}</a>`),
    );
  });
});
