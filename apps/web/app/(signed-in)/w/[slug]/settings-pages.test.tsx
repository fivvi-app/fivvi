import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, render } from '../../../../test/render';
import { GeneralForm } from './settings/general/general-form';
import { NoPermission } from './settings/general/no-permission';
import { WorkspaceFrame } from './workspace-frame';

// The form refreshes the page through the router, which exists only in a running app.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F002 workspace frame and settings in %s', (locale) => {
  const copy = messages[locale];

  it('AC6: the frame shows the workspace name in its sidebar header', () => {
    const html = render(
      locale,
      <WorkspaceFrame name="John's Gym Utrecht" slug="johns-gym" isOwner>
        <hr id="page" />
      </WorkspaceFrame>,
    );

    expect(html).toContain('John&#x27;s Gym Utrecht');
    expect(html).toContain('<hr id="page"/>');
  });

  it('AC7: the Owner has Settings in the navigation, linking to the general settings', () => {
    const html = render(
      locale,
      <WorkspaceFrame name="John's Gym" slug="johns-gym" isOwner>
        <hr id="page" />
      </WorkspaceFrame>,
    );

    expect(html).toContain(`aria-label="${escapeHtml(copy.workspaceNav.label)}"`);
    expect(html).toMatch(
      new RegExp(
        `<a[^>]*href="/w/johns-gym/settings/general"[^>]*>${escapeHtml(copy.workspaceNav.settings)}</a>`,
      ),
    );
  });

  it('AC7: a Trainer has no Settings in the navigation', () => {
    const html = render(
      locale,
      <WorkspaceFrame name="John's Gym" slug="johns-gym" isOwner={false}>
        <hr id="page" />
      </WorkspaceFrame>,
    );

    expect(html).not.toContain(escapeHtml(copy.workspaceNav.settings));
    expect(html).not.toContain('/settings');
  });

  it('AC6: TW-08 shows the name field with its value and Save, and the URL name and time zone read-only', () => {
    const html = render(
      locale,
      <GeneralForm
        workspaceId="w1"
        name="John's Gym"
        slug="johns-gym"
        timeZone="Europe/Amsterdam"
      />,
    );

    expect(html).toContain(`<h1>${escapeHtml(copy.settingsGeneral.title)}</h1>`);
    expect(html).toMatch(
      new RegExp(
        `<label[^>]*for="workspace-name"[^>]*>${escapeHtml(copy.settingsGeneral.nameLabel)}</label>`,
      ),
    );
    expect(html).toMatch(/<input[^>]*id="workspace-name"[^>]*value="John&#x27;s Gym"/);
    expect(html).toMatch(
      new RegExp(
        `<button[^>]*type="submit"[^>]*>${escapeHtml(copy.settingsGeneral.save)}</button>`,
      ),
    );
    for (const [label, value] of [
      [copy.settingsGeneral.urlNameLabel, 'johns-gym'],
      [copy.settingsGeneral.timeZoneLabel, 'Europe/Amsterdam'],
    ]) {
      expect(html).toContain(escapeHtml(label as string));
      expect(html).toContain(value as string);
    }
    // The read-only values are no inputs: only the name can be edited.
    expect(html.match(/<input/g)).toHaveLength(1);
    expect(html).not.toContain('role="alert"');
  });

  it('AC7: the no-permission page names the workspace and offers no form', () => {
    const html = render(locale, <NoPermission workspace="John's Gym" />);

    expect(html).toContain(`<h1>${escapeHtml(copy.noPermission.title)}</h1>`);
    expect(html).toContain(escapeHtml(copy.noPermission.body.replace('{workspace}', "John's Gym")));
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<input');
  });
});
