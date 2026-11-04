import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { OWNER, TRAINER } from '../../../../test/capabilities';
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
            trainsHere: true,
          },
          {
            workspaceId: 'w2',
            name: 'Sarah Personal Training',
            slug: 'sarah',
            role: 'owner',
            capabilities: [],
            trainsHere: false,
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

  const johnsGym = {
    workspaceId: 'w1',
    name: "John's Gym",
    slug: 'johns-gym',
    role: 'owner',
    capabilities: OWNER,
    trainsHere: true,
  } as const;
  const sarahsGym = {
    workspaceId: 'w2',
    name: 'Sarah Personal Training',
    slug: 'sarah',
    role: 'owner',
    capabilities: OWNER,
    trainsHere: false,
  } as const;

  /** The switch of a workspace: the input named by its label. */
  const switchOf = (html: string, workspace: string) =>
    html.match(
      new RegExp(
        `<label[^>]*for="([^"]+)"[^>]*>${escapeHtml(copy.profile.trainsHere.label.replace('{workspace}', workspace))}</label>`,
      ),
    );

  it('AC4: an Owner has the switch "I also train at {workspace}", on when they train', () => {
    const html = render(
      locale,
      <MyProfile name="John" email="john@example.com" workspaces={[johnsGym, sarahsGym]} />,
    );

    const johns = switchOf(html, "John's Gym");
    expect(johns).not.toBeNull();
    expect(html).toMatch(
      new RegExp(`<input[^>]*id="${johns?.[1]}"[^>]*role="switch"[^>]*\\schecked=""`),
    );
    const sarahs = switchOf(html, 'Sarah Personal Training');
    expect(sarahs).not.toBeNull();
    expect(html).toMatch(new RegExp(`<input[^>]*id="${sarahs?.[1]}"[^>]*role="switch"`));
    expect(html).not.toMatch(new RegExp(`<input[^>]*id="${sarahs?.[1]}"[^>]*\\schecked=""`));
  });

  it('AC5: no switch for a workspace where the person is a Trainer', () => {
    const html = render(
      locale,
      <MyProfile
        name="Sarah"
        email="sarah@example.com"
        workspaces={[{ ...johnsGym, role: 'trainer', capabilities: TRAINER }, sarahsGym]}
      />,
    );

    expect(switchOf(html, "John's Gym")).toBeNull();
    expect(switchOf(html, 'Sarah Personal Training')).not.toBeNull();
    expect(html.match(/role="switch"/g)).toHaveLength(1);
  });

  it('F010 AC1: has the Language row with the two languages in their own language, the current one marked', () => {
    const html = render(
      locale,
      <MyProfile name="Sarah" email="sarah@example.com" workspaces={[]} />,
    );

    // The row is named like the app's Profiel → Taal (`profile.language`).
    expect(html).toContain(`>${escapeHtml(copy.profile.language)}<`);
    const current = locale === 'en' ? copy.userMenu.languageEn : copy.userMenu.languageNl;
    const other = locale === 'en' ? copy.userMenu.languageNl : copy.userMenu.languageEn;
    expect(html).toMatch(
      new RegExp(`<button[^>]*aria-pressed="true"[^>]*>(?:<svg.*?</svg>)?${current}</button>`),
    );
    expect(html).toMatch(
      new RegExp(`<button[^>]*aria-pressed="false"[^>]*>(?:<svg.*?</svg>)?${other}</button>`),
    );
    // The two buttons are one group, named by the heading.
    expect(html).toMatch(
      new RegExp(
        `<h2 id="([^"]+)">${escapeHtml(copy.profile.language)}</h2>[\\s\\S]*<fieldset[^>]*aria-labelledby="\\1"`,
      ),
    );
    expect(html).not.toContain('role="alert"');
  });

  it('the switch talks about training, never about profiles', () => {
    expect(copy.profile.trainsHere.label).not.toMatch(/profiel|profile/i);
  });
});
