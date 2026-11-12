import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { OWNER, TRAINER } from '../../../../../test/capabilities';
import { escapeHtml, render } from '../../../../../test/render';
import { GeneralForm } from './settings/general/general-form';
import { NoPermission } from './settings/general/no-permission';
import { LanguageForm } from './settings/language/language-form';
import { LocationForm } from './settings/locations/location-form';
import { WorkspaceFrame } from './workspace-frame';

// The form refreshes the page through the router, which exists only in a running app.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {} }),
  usePathname: () => null,
}));

/** A section of the navigation has its icon before the label (E020 #626); a page under it has none. */
const NAV_ICON = '<svg[^>]*aria-hidden="true"[^>]*>.*?</svg>';

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F002 workspace frame and settings in %s', (locale) => {
  const copy = messages[locale];

  it('AC6: the frame shows the workspace name in its sidebar header', () => {
    const html = render(
      locale,
      <WorkspaceFrame
        name="John's Gym Utrecht"
        slug="johns-gym"
        teamRole="owner"
        workspaces={[]}
        canCreateWorkspace={false}
        capabilities={OWNER}
        personName={null}
      >
        <hr id="page" />
      </WorkspaceFrame>,
    );

    expect(html).toContain('John&#x27;s Gym Utrecht');
    expect(html).toContain('<hr id="page"/>');
  });

  it('F003: the sidebar header shows the workspace name and the role label, as plain text', () => {
    const owner = render(
      locale,
      <WorkspaceFrame
        name="John's Gym"
        slug="johns-gym"
        teamRole="owner"
        workspaces={[]}
        canCreateWorkspace={false}
        capabilities={OWNER}
        personName={null}
      >
        <hr />
      </WorkspaceFrame>,
    );
    const trainer = render(
      locale,
      <WorkspaceFrame
        name="John's Gym"
        slug="johns-gym"
        teamRole="trainer"
        workspaces={[]}
        canCreateWorkspace={false}
        capabilities={TRAINER}
        personName={null}
      >
        <hr />
      </WorkspaceFrame>,
    );

    expect(owner).toContain(`John&#x27;s Gym · ${escapeHtml(copy.roles.owner)}`);
    expect(trainer).toContain(`John&#x27;s Gym · ${escapeHtml(copy.roles.trainer)}`);
    expect(trainer).not.toContain(escapeHtml(copy.roles.owner));
  });

  it('F003 AC2: the Owner has Trainers in the navigation, linking to the Trainers page', () => {
    const html = render(
      locale,
      <WorkspaceFrame
        name="John's Gym"
        slug="johns-gym"
        teamRole="owner"
        workspaces={[]}
        canCreateWorkspace={false}
        capabilities={OWNER}
        personName={null}
      >
        <hr />
      </WorkspaceFrame>,
    );

    expect(html).toMatch(
      new RegExp(
        `<a[^>]*href="/w/johns-gym/trainers"[^>]*>${NAV_ICON}<span[^>]*>${escapeHtml(copy.workspaceNav.trainers)}</span></a>`,
      ),
    );
  });

  it('F003 AC3: a Trainer has no Trainers in the navigation', () => {
    const html = render(
      locale,
      <WorkspaceFrame
        name="John's Gym"
        slug="johns-gym"
        teamRole="trainer"
        workspaces={[]}
        canCreateWorkspace={false}
        capabilities={TRAINER}
        personName={null}
      >
        <hr />
      </WorkspaceFrame>,
    );

    expect(html).not.toContain('/trainers');
  });

  it('F029: the Owner and a Trainer have the Aanmeldlink in the navigation, between Trainers and Settings', () => {
    const frame = (teamRole: 'owner' | 'trainer', capabilities: typeof OWNER) =>
      render(
        locale,
        <WorkspaceFrame
          name="John's Gym"
          slug="johns-gym"
          teamRole={teamRole}
          workspaces={[]}
          canCreateWorkspace={false}
          capabilities={capabilities}
          personName={null}
        >
          <hr />
        </WorkspaceFrame>,
      );
    const link = new RegExp(
      `<a[^>]*href="/w/johns-gym/join-link"[^>]*>${NAV_ICON}<span[^>]*>${escapeHtml(copy.workspaceNav.joinLink)}</span></a>`,
    );

    const owner = frame('owner', OWNER);
    expect(owner).toMatch(link);
    expect(owner.indexOf('/w/johns-gym/trainers')).toBeLessThan(
      owner.indexOf('/w/johns-gym/join-link'),
    );
    expect(owner.indexOf('/w/johns-gym/join-link')).toBeLessThan(
      owner.indexOf('/w/johns-gym/settings/general'),
    );
    expect(frame('trainer', TRAINER)).toMatch(link);
    // The section follows the capability, not the role.
    expect(frame('owner', [])).not.toContain('/join-link');
  });

  it('F004 AC9: the navigation follows the capability list, not the role name', () => {
    const ownerWithoutCapabilities = render(
      locale,
      <WorkspaceFrame
        name="John's Gym"
        slug="johns-gym"
        teamRole="owner"
        workspaces={[]}
        canCreateWorkspace={false}
        capabilities={[]}
        personName={null}
      >
        <hr />
      </WorkspaceFrame>,
    );
    const trainerWithEveryCapability = render(
      locale,
      <WorkspaceFrame
        name="John's Gym"
        slug="johns-gym"
        teamRole="trainer"
        workspaces={[]}
        canCreateWorkspace={false}
        capabilities={OWNER}
        personName={null}
      >
        <hr />
      </WorkspaceFrame>,
    );

    // The label is the role; the sections are the capabilities.
    expect(ownerWithoutCapabilities).toContain(`John&#x27;s Gym · ${escapeHtml(copy.roles.owner)}`);
    expect(ownerWithoutCapabilities).not.toContain('/trainers');
    expect(ownerWithoutCapabilities).not.toContain('/settings');
    expect(trainerWithEveryCapability).toContain('href="/w/johns-gym/trainers"');
    expect(trainerWithEveryCapability).toContain('href="/w/johns-gym/settings/general"');
  });

  it('F004: Trainers needs team.view and Settings needs workspace.manage, each on its own', () => {
    const frame = (capabilities: typeof OWNER) =>
      render(
        locale,
        <WorkspaceFrame
          name="John's Gym"
          slug="johns-gym"
          teamRole="trainer"
          workspaces={[]}
          canCreateWorkspace={false}
          capabilities={capabilities}
          personName={null}
        >
          <hr />
        </WorkspaceFrame>,
      );

    const onlyTeam = frame(['team.view']);
    expect(onlyTeam).toContain('href="/w/johns-gym/trainers"');
    expect(onlyTeam).not.toContain('/settings');
    const onlySettings = frame(['workspace.manage']);
    expect(onlySettings).toContain('href="/w/johns-gym/settings/general"');
    expect(onlySettings).not.toContain('/trainers');
  });

  it('AC7: the Owner has Settings in the navigation, linking to the general settings', () => {
    const html = render(
      locale,
      <WorkspaceFrame
        name="John's Gym"
        slug="johns-gym"
        teamRole="owner"
        workspaces={[]}
        canCreateWorkspace={false}
        capabilities={OWNER}
        personName={null}
      >
        <hr id="page" />
      </WorkspaceFrame>,
    );

    expect(html).toContain(`aria-label="${escapeHtml(copy.workspaceNav.label)}"`);
    expect(html).toMatch(
      new RegExp(
        `<a[^>]*href="/w/johns-gym/settings/general"[^>]*>${NAV_ICON}<span[^>]*>${escapeHtml(copy.workspaceNav.settings)}</span></a>`,
      ),
    );
  });

  it('F010 AC7: the Owner has the General and Language settings in the navigation', () => {
    const html = render(
      locale,
      <WorkspaceFrame
        name="John's Gym"
        slug="johns-gym"
        teamRole="owner"
        workspaces={[]}
        canCreateWorkspace={false}
        capabilities={OWNER}
        personName={null}
      >
        <hr id="page" />
      </WorkspaceFrame>,
    );

    for (const [path, label] of [
      ['general', copy.workspaceNav.settingsGeneral],
      ['language', copy.workspaceNav.settingsLanguage],
    ]) {
      expect(html).toMatch(
        new RegExp(
          `<a[^>]*href="/w/johns-gym/settings/${path}"[^>]*><span[^>]*>${escapeHtml(label as string)}</span></a>`,
        ),
      );
    }
  });

  it('F010 AC8: a Trainer has no Language in the navigation', () => {
    const html = render(
      locale,
      <WorkspaceFrame
        name="John's Gym"
        slug="johns-gym"
        teamRole="trainer"
        workspaces={[]}
        canCreateWorkspace={false}
        capabilities={TRAINER}
        personName={null}
      >
        <hr id="page" />
      </WorkspaceFrame>,
    );

    expect(html).not.toContain(escapeHtml(copy.workspaceNav.settingsLanguage));
    expect(html).not.toContain('/settings/language');
  });

  it('F010 AC7: TW-08 Language shows the two languages in their own names, the current one checked, the help line and Save', () => {
    const html = render(locale, <LanguageForm workspaceId="w1" defaultLocale="en" />);

    expect(html).toMatch(new RegExp(`<h2[^>]*>${escapeHtml(copy.settingsLanguage.title)}</h2>`));
    expect(html).toContain(escapeHtml(copy.settingsLanguage.defaultLabel));
    expect(html).toContain(escapeHtml(copy.settingsLanguage.help));
    expect(html).toMatch(
      new RegExp(
        `<label[^>]*>[^<]*<input[^>]*value="nl-NL"[^>]*/?>[^<]*${copy.settingsLanguage.optionNl}`,
      ),
    );
    expect(html.match(/<input[^>]*type="radio"/g)).toHaveLength(2);
    expect(html).toMatch(
      /<input[^>]*value="en"[^>]*checked=""|<input[^>]*checked=""[^>]*value="en"/,
    );
    expect(html).not.toMatch(/<input[^>]*value="nl-NL"[^>]*checked/);
    expect(html).toContain(copy.settingsLanguage.optionEn);
    expect(html).toMatch(
      new RegExp(
        `<button[^>]*type="submit"[^>]*>${escapeHtml(copy.settingsLanguage.save)}</button>`,
      ),
    );
    expect(html).not.toContain('role="alert"');
  });

  it('AC7: a Trainer has no Settings in the navigation', () => {
    const html = render(
      locale,
      <WorkspaceFrame
        name="John's Gym"
        slug="johns-gym"
        teamRole="trainer"
        workspaces={[]}
        canCreateWorkspace={false}
        capabilities={TRAINER}
        personName={null}
      >
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

    expect(html).toMatch(new RegExp(`<h2[^>]*>${escapeHtml(copy.settingsGeneral.title)}</h2>`));
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

  it('F015 AC4: the Owner has Location in the navigation, linking to the location settings', () => {
    const html = render(
      locale,
      <WorkspaceFrame
        name="John's Gym"
        slug="johns-gym"
        teamRole="owner"
        workspaces={[]}
        canCreateWorkspace={false}
        capabilities={OWNER}
        personName={null}
      >
        <hr id="page" />
      </WorkspaceFrame>,
    );

    expect(html).toMatch(
      new RegExp(
        `<a[^>]*href="/w/johns-gym/settings/locations"[^>]*><span[^>]*>${escapeHtml(copy.workspaceNav.settingsLocation)}</span></a>`,
      ),
    );
  });

  it('F015 AC6: a Trainer has no Location in the navigation, and Location needs settings.manage', () => {
    const frame = (capabilities: typeof OWNER) =>
      render(
        locale,
        <WorkspaceFrame
          name="John's Gym"
          slug="johns-gym"
          teamRole="trainer"
          workspaces={[]}
          canCreateWorkspace={false}
          capabilities={capabilities}
          personName={null}
        >
          <hr />
        </WorkspaceFrame>,
      );

    expect(frame(TRAINER)).not.toContain('/settings/locations');
    expect(frame(['workspace.manage'])).not.toContain('/settings/locations');
    expect(frame(['workspace.manage', 'settings.manage'])).toContain(
      'href="/w/johns-gym/settings/locations"',
    );
  });

  it('F015 AC2: TW-08 Location shows the name, the type read-only, the address fields and Save', () => {
    const html = render(
      locale,
      <LocationForm
        workspaceId="w1"
        locationId="l1"
        name="John's Gym"
        type="organization_location"
        address={null}
      />,
    );

    expect(html).toMatch(new RegExp(`<h2[^>]*>${escapeHtml(copy.settingsLocation.title)}</h2>`));
    expect(html).toContain(escapeHtml(copy.settingsLocation.help));
    expect(html).toMatch(/<input[^>]*id="location-name"[^>]*value="John&#x27;s Gym"/);
    // The type is text, not a field: only the name and the five address fields can be edited.
    expect(html).toContain(escapeHtml(copy.settingsLocation.typeLabel));
    expect(html).toContain(escapeHtml(copy.settingsLocation.types.organizationLocation));
    expect(html.match(/<input/g)).toHaveLength(6);
    for (const [id, label] of [
      ['location-name', copy.settingsLocation.nameLabel],
      ['location-postcode', copy.settingsLocation.postcodeLabel],
      ['location-house-number', copy.settingsLocation.houseNumberLabel],
      ['location-addition', copy.settingsLocation.additionLabel],
      ['location-street', copy.settingsLocation.streetLabel],
      ['location-city', copy.settingsLocation.cityLabel],
    ] as const) {
      expect(html).toMatch(new RegExp(`<label[^>]*for="${id}"[^>]*>${escapeHtml(label)}</label>`));
    }
    expect(html).toContain(escapeHtml(copy.settingsLocation.addressLegend));
    expect(html).toMatch(
      new RegExp(
        `<button[^>]*type="submit"[^>]*>${escapeHtml(copy.settingsLocation.save)}</button>`,
      ),
    );
    expect(html).not.toContain('role="alert"');
    // Nothing was looked up, so there is no "filled in" note yet.
    expect(html).not.toContain(escapeHtml(copy.settingsLocation.lookup.filled));
  });

  it('F015 AC4: TW-08 Location shows the saved address in its fields', () => {
    const html = render(
      locale,
      <LocationForm
        workspaceId="w1"
        locationId="l1"
        name="John's Gym Centrum"
        type="organization_location"
        address={{
          postcode: '1234 AB',
          houseNumber: '1',
          houseNumberAddition: 'A',
          street: 'Voorbeeldstraat',
          city: 'Amsterdam',
        }}
      />,
    );

    for (const [id, value] of [
      ['location-postcode', '1234 AB'],
      ['location-house-number', '1'],
      ['location-addition', 'A'],
      ['location-street', 'Voorbeeldstraat'],
      ['location-city', 'Amsterdam'],
    ]) {
      expect(html).toMatch(new RegExp(`<input[^>]*id="${id}"[^>]*value="${value}"`));
    }
    // A saved address was typed or looked up before: it is not claimed to be filled in now.
    expect(html).not.toContain(escapeHtml(copy.settingsLocation.lookup.filled));
  });

  it('E020 AC15: each settings page is the trainer web page with the Settings title above one card; its title is the card’s title and Save is the card’s action at the top right', () => {
    const pages = {
      general: [
        <GeneralForm
          key="g"
          workspaceId="w1"
          name="John's Gym"
          slug="johns-gym"
          timeZone="Europe/Amsterdam"
        />,
        copy.settingsGeneral,
      ],
      language: [
        <LanguageForm key="l" workspaceId="w1" defaultLocale="en" />,
        copy.settingsLanguage,
      ],
      location: [
        <LocationForm
          key="o"
          workspaceId="w1"
          locationId="l1"
          name="John's Gym"
          type="organization_location"
          address={null}
        />,
        copy.settingsLocation,
      ],
    } as const;

    for (const [name, [element, text]] of Object.entries(pages)) {
      const html = render(locale, element);

      expect(html, name).toMatch(/<main[^>]*data-slot="page-shell"/);
      expect(html.match(/data-slot="card"/g), name).toHaveLength(1);
      // The page title *Settings* is above the card, 20px as the prototype's `.w-top h1` (E020 #628).
      expect(html, name).toMatch(
        new RegExp(
          `<main[^>]*data-slot="page-shell".*?<h1[^>]*class="[^"]*text-xl[^"]*font-semibold[^"]*"[^>]*>${escapeHtml(copy.workspaceNav.settings)}</h1>.*?<div[^>]*data-slot="card"`,
        ),
      );
      expect(html.match(/<h1/g), name).toHaveLength(1);
      expect(html, name).toMatch(
        new RegExp(
          `<div[^>]*data-slot="card-header"[^>]*>.*?<h2[^>]*class="[^"]*text-\\[15px\\][^"]*font-semibold[^"]*"[^>]*>${escapeHtml(text.title)}</h2>.*?<div[^>]*data-slot="card-action"[^>]*><button[^>]*type="submit"[^>]*>${escapeHtml(text.save)}</button></div></div>`,
        ),
      );
    }
  });

  it('E020 AC15: the name, location and address are the kit’s fields', () => {
    const general = render(
      locale,
      <GeneralForm
        workspaceId="w1"
        name="John's Gym"
        slug="johns-gym"
        timeZone="Europe/Amsterdam"
      />,
    );
    const location = render(
      locale,
      <LocationForm
        workspaceId="w1"
        locationId="l1"
        name="John's Gym"
        type="organization_location"
        address={null}
      />,
    );

    expect(general.match(/data-slot="field"/g)).toHaveLength(1);
    expect(location.match(/data-slot="field"/g)).toHaveLength(6);
    // A row of fields keeps its inputs at one height when one of them shows a message.
    expect(location.match(/<div class="grid items-start gap-4 sm:grid-cols-[23]">/g)).toHaveLength(
      2,
    );
  });

  it('AC7: the no-permission page names the workspace and offers no form', () => {
    const html = render(locale, <NoPermission workspace="John's Gym" />);

    expect(html).toContain(`<h1>${escapeHtml(copy.noPermission.title)}</h1>`);
    expect(html).toContain(escapeHtml(copy.noPermission.body.replace('{workspace}', "John's Gym")));
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<input');
  });
});
