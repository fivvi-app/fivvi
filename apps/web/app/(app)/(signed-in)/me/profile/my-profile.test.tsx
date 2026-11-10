import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { OWNER, TRAINER } from '../../../../../test/capabilities';
import { escapeHtml, render } from '../../../../../test/render';
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
        bookingEmails
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
    // F012: each row links to its workspace (a link, not a button: the page changes).
    expect(html).toMatch(
      new RegExp(
        `<a[^>]*href="/w/johns-gym"[^>]*>John&#x27;s Gym</a><span[^>]*>${escapeHtml(copy.roles.trainer)}<`,
      ),
    );
    expect(html).toMatch(
      new RegExp(
        `<a[^>]*href="/w/sarah"[^>]*>Sarah Personal Training</a><span[^>]*>${escapeHtml(copy.roles.owner)}<`,
      ),
    );
    expect(html.split(copy.myProfile.workspacesTitle)[1]).not.toContain('<button');
  });

  it('AC1: shows the name in an editable field with Save, and the email address read-only', () => {
    const html = render(
      locale,
      <MyProfile name="Sarah de Vries" bookingEmails email="sarah@example.com" workspaces={[]} />,
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
      <MyProfile name={null} bookingEmails email="sarah@example.com" workspaces={[]} />,
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
      <MyProfile
        name="John"
        bookingEmails
        email="john@example.com"
        workspaces={[johnsGym, sarahsGym]}
      />,
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
        bookingEmails
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
      <MyProfile name="Sarah" bookingEmails email="sarah@example.com" workspaces={[]} />,
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
        `<h2 id="([^"]+)"[^>]*>${escapeHtml(copy.profile.language)}</h2>[\\s\\S]*<fieldset[^>]*aria-labelledby="\\1"`,
      ),
    );
    expect(html).not.toContain('role="alert"');
  });

  // E020 #627: the look of TW-09 (docs/design/prototype-v2, *Mijn profiel (TW-09)*).
  it('E020 AC15: the page has the trainer web’s padding and four cards, each with a 15 px heading', () => {
    const html = render(
      locale,
      <MyProfile name="John" bookingEmails email="john@example.com" workspaces={[johnsGym]} />,
    );

    expect(html).toMatch(/<main[^>]*px-6[^>]*pt-5[^>]*pb-10/);
    expect(html.match(/data-slot="card"/g)).toHaveLength(4);
    expect(html.match(/<h2[^>]*text-\[15px\][^>]*font-semibold/g)).toHaveLength(4);
  });

  it('E020 AC15: the name is a kit field, labelled', () => {
    const html = render(
      locale,
      <MyProfile name="Sarah" bookingEmails email="sarah@example.com" workspaces={[]} />,
    );

    expect(html).toMatch(
      new RegExp(
        `data-slot="field"[^>]*><label[^>]*for="person-name"[^>]*>${escapeHtml(copy.myProfile.nameLabel)}</label><input[^>]*id="person-name"`,
      ),
    );
  });

  it('E020 AC15: the role of each workspace is a status pill', () => {
    const html = render(
      locale,
      <MyProfile name="John" bookingEmails email="john@example.com" workspaces={[johnsGym]} />,
    );

    expect(html).toMatch(
      new RegExp(`<span[^>]*data-slot="status-pill"[^>]*>${escapeHtml(copy.roles.owner)}</span>`),
    );
  });

  // F050 #1030: the checkbox of the emails about bookings (saving is in e2e/profile.spec.ts).
  describe('F050 AC6: the section Emails', () => {
    const box = (html: string) =>
      html.match(
        new RegExp(
          `<label[^>]*for="([^"]+)"[^>]*>${escapeHtml(copy.myProfile.bookingEmailsLabel)}</label>`,
        ),
      );

    it.each([true, false])(
      'has the checkbox "E-mails over boekingen in mijn lessen" with its help text, checked as the account says (%s)',
      (bookingEmails) => {
        const html = render(
          locale,
          <MyProfile
            name="Sarah"
            email="sarah@example.com"
            bookingEmails={bookingEmails}
            workspaces={[]}
          />,
        );

        expect(html).toMatch(new RegExp(`<h2[^>]*>${escapeHtml(copy.myProfile.emailsTitle)}</h2>`));
        const label = box(html);
        expect(label).not.toBeNull();
        const input = html.match(new RegExp(`<input[^>]*id="${label?.[1]}"[^>]*>`))?.[0] ?? '';
        expect(input).toContain('type="checkbox"');
        expect(/\schecked=""/.test(input)).toBe(bookingEmails);
        // The help text is read with the box.
        const described = input.match(/aria-describedby="([^"]+)"/)?.[1];
        expect(html).toMatch(
          new RegExp(`id="${described}"[^>]*>${escapeHtml(copy.myProfile.bookingEmailsHelp)}<`),
        );
        expect(html).not.toContain('role="alert"');
      },
    );

    it('uses the words boeking / booking, never afmelding, aanmelding or reservering', () => {
      expect(
        `${copy.myProfile.emailsTitle} ${copy.myProfile.bookingEmailsLabel} ${copy.myProfile.bookingEmailsHelp}`,
      ).not.toMatch(/afmelding|aanmelding|reservering|reservation/i);
    });
  });

  it('the switch talks about training, never about profiles', () => {
    expect(copy.profile.trainsHere.label).not.toMatch(/profiel|profile/i);
  });
});
