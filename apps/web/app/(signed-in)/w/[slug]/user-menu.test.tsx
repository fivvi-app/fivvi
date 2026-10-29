import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, render } from '../../../../test/render';
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
      <WorkspaceFrame name="John's Gym" slug="johns-gym" isOwner={false}>
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
});
