import type { Schemas } from '@fivvi/contract';
import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { OWNER, TRAINER } from '../../../../../../test/capabilities';
import { escapeHtml, render } from '../../../../../../test/render';
import { WorkspaceFrame } from '../workspace-frame';
import { ClientList } from './client-list';
import { ClientProfile } from './client-profile';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => null,
}));

const anna: Schemas['Client'] = {
  id: 'c1',
  name: 'Anna de Vries',
  email: 'anna@example.com',
  emailLocale: null,
};
const mark: Schemas['Client'] = {
  id: 'c2',
  name: 'Mark Jansen',
  email: 'mark@example.com',
  emailLocale: null,
};

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F006 TW-01 Clients in %s', (locale) => {
  const copy = messages[locale];

  const frame = (
    capabilities: typeof OWNER,
    quickAdd?: { workspaceId: string; defaultLocale: 'nl-NL' | 'en' },
  ) =>
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
        quickAdd={quickAdd}
      >
        <hr />
      </WorkspaceFrame>,
    );

  it('the navigation has Clients for a person with clients.view, linking to the list', () => {
    for (const capabilities of [OWNER, TRAINER]) {
      expect(frame(capabilities)).toMatch(
        new RegExp(
          `<a[^>]*href="/w/johns-gym/clients"[^>]*><svg[^>]*aria-hidden="true"[^>]*>.*?</svg><span[^>]*>${escapeHtml(copy.workspaceNav.clients)}</span></a>`,
        ),
      );
    }
  });

  it('F004: Clients needs clients.view, not a role', () => {
    expect(frame(['trainers.view', 'clients.manage'])).not.toContain('/clients');
    expect(frame(['clients.view'])).toContain('href="/w/johns-gym/clients"');
  });

  it('the top bar has + Nieuw only for a person who may add clients', () => {
    const withAdd = frame(TRAINER, { workspaceId: 'w1', defaultLocale: 'nl-NL' });
    const without = frame(['clients.view']);

    expect(withAdd).toMatch(
      new RegExp(
        `<button[^>]*aria-expanded="false"[^>]*>.*${escapeHtml(copy.workspaceNav.new)}</button>`,
      ),
    );
    expect(without).not.toContain(escapeHtml(copy.workspaceNav.new));
  });

  const list = (items: Schemas['Client'][], total = items.length) =>
    render(locale, <ClientList workspaceId="w1" slug="johns-gym" initial={{ items, total }} />);

  it('AC6: the list shows each client’s name and email address, linking to the profile', () => {
    const html = list([anna, mark]);

    expect(html).toMatch(new RegExp(`<h1[^>]*>${escapeHtml(copy.clients.title)}</h1>`));
    expect(html).toMatch(
      /<a[^>]*href="\/w\/johns-gym\/clients\/c1"[^>]*>(?:<span[^>]*data-slot="avatar"[^>]*><\/span>)?<span[^>]*>Anna de Vries<\/span><span class="sr-only">, <\/span><span[^>]*>anna@example\.com<\/span>(?:<svg.*?<\/svg>)?<\/a>/,
    );
    expect(html).toMatch(
      /<a[^>]*href="\/w\/johns-gym\/clients\/c2"[^>]*>(?:<span[^>]*data-slot="avatar"[^>]*><\/span>)?<span[^>]*>Mark Jansen<\/span><span class="sr-only">, <\/span><span[^>]*>mark@example\.com<\/span>(?:<svg.*?<\/svg>)?<\/a>/,
    );
    expect(html).toContain(`placeholder="${escapeHtml(copy.clients.searchPlaceholder)}"`);
  });

  // E020 #627: the look of TW-01 (docs/design/prototype-v2, *Klanten (TW-01)*).
  it('E020 AC15: the clients are the rows of one card, each with an avatar and a chevron, the name over the address', () => {
    const html = list([anna, mark]);

    // One card holds the list; its rows are separated by a hairline.
    expect(html).toMatch(/<div[^>]*data-slot="card"[^>]*>(?:(?!<\/ul>).)*<ul[^>]*aria-label/s);
    expect(html.match(/<li[^>]*border-b/g)).toHaveLength(2);
    // The avatar carries the initials in an attribute (no text for screen readers), hidden from them.
    expect(html).toMatch(/<span[^>]*data-slot="avatar"[^>]*data-initials="AD"/);
    expect(html).toMatch(/<span[^>]*data-slot="avatar"[^>]*data-initials="MJ"/);
    expect(html).not.toMatch(/>AD</);
    // The end of a row is a chevron, drawn and hidden from screen readers.
    const row = html.match(/<a[^>]*href="\/w\/johns-gym\/clients\/c1"[^>]*>.*?<\/a>/s)?.[0] ?? '';
    expect(row).toMatch(/<svg[^>]*aria-hidden="true"[^>]*><path d="m9 6 6 6-6 6"><\/path>/);
    // The name is the strong line, the address the quiet one.
    expect(row).toMatch(/<span[^>]*font-semibold[^>]*>Anna de Vries<\/span>/);
    expect(row).toMatch(/<span[^>]*text-muted-foreground[^>]*>anna@example\.com<\/span>/);
  });

  it('E020 AC15: the page has the trainer web’s padding, the title and the add action in one row, and a search field with its icon', () => {
    const frameHtml = render(
      locale,
      <WorkspaceFrame
        name="John's Gym"
        slug="johns-gym"
        teamRole="owner"
        workspaces={[]}
        canCreateWorkspace={false}
        capabilities={OWNER}
        personName={null}
        quickAdd={{ workspaceId: 'w1', defaultLocale: 'nl-NL' }}
      >
        <ClientList workspaceId="w1" slug="johns-gym" initial={{ items: [anna], total: 1 }} />
      </WorkspaceFrame>,
    );

    expect(frameHtml).toMatch(/<main[^>]*px-6[^>]*pt-5[^>]*pb-10/);
    expect(frameHtml).toMatch(
      new RegExp(
        `<h1[^>]*>${escapeHtml(copy.clients.title)}</h1><button[^>]*type="button"[^>]*><svg[^>]*aria-hidden="true"[^>]*>.*?</svg>${escapeHtml(copy.clients.add)}</button>`,
        's',
      ),
    );
    expect(frameHtml).toMatch(
      /<svg[^>]*aria-hidden="true"[^>]*><circle cx="11" cy="11" r="7"><\/circle>.*?<input[^>]*type="search"/s,
    );
  });

  it('E020 AC15: the empty list is the message in a card, not a list', () => {
    // The add action needs the quick-add provider, the error and the slow load a running page:
    // they are in the e2e suite (clients.spec.ts, theme.spec.ts).
    const html = list([]);

    expect(html).toMatch(/data-slot="card"[^>]*>.*?<p>/s);
    expect(html).toContain(escapeHtml(copy.clients.empty));
    expect(html).not.toContain('<ul');
  });

  it('shows the empty state with its one action when the workspace has no clients', () => {
    const html = list([]);

    expect(html).toContain(escapeHtml(copy.clients.empty));
    expect(html).not.toContain('<ul');
  });

  it('says how many of the matching clients are shown when the page holds fewer', () => {
    const html = list([anna], 120);

    expect(html).toContain(
      escapeHtml(copy.clients.partial.replace('{shown}', '1').replace('{total}', '120')),
    );
    expect(list([anna])).not.toContain('120');
  });

  const profile = (
    client: Schemas['Client'],
    added = false,
    defaultLocale: 'nl-NL' | 'en' = 'nl-NL',
    canEdit = true,
    sessions: Schemas['UpcomingSession'][] = [],
  ) =>
    render(
      locale,
      <ClientProfile
        client={client}
        upcoming={{ clientId: client.id, timeZone: 'Europe/Amsterdam', sessions }}
        workspaceId="w1"
        slug="johns-gym"
        canEdit={canEdit}
        defaultLocale={defaultLocale}
        added={added}
      />,
    );

  const upcomingSession = (id: string, startsAt: string, trainer?: string) => ({
    id,
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + 3_600_000).toISOString(),
    ...(trainer ? { trainer: { id: 't1', name: trainer } } : {}),
  });
  const wall = (instant: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-NL', {
      timeZone: 'Europe/Amsterdam',
      ...options,
    }).format(new Date(instant));

  it('F020 AC9: the overview lists the upcoming sessions in the order given, each with its date, time, trainer and page', () => {
    const html = profile(anna, false, 'nl-NL', true, [
      upcomingSession('s1', '2026-09-24T07:00:00.000Z', 'Sarah'),
      upcomingSession('s2', '2026-09-25T08:00:00.000Z', 'Tom'),
      upcomingSession('s3', '2026-10-01T07:30:00.000Z'),
    ]);

    expect(html).toContain(escapeHtml(copy.clients.profile.upcomingTitle));
    expect(html).not.toContain(escapeHtml(copy.clients.profile.upcomingEmpty));
    const first = copy.clients.profile.upcomingWhen
      .replace(
        '{date}',
        wall('2026-09-24T07:00:00.000Z', { weekday: 'short', day: 'numeric', month: 'short' }),
      )
      .replace('{time}', '09:00');
    expect(html).toContain(`href="/w/johns-gym/sessions/s1"`);
    expect(html).toContain(escapeHtml(first));
    expect(html.indexOf('/sessions/s1')).toBeLessThan(html.indexOf('/sessions/s2'));
    expect(html.indexOf('/sessions/s2')).toBeLessThan(html.indexOf('/sessions/s3'));
    expect(html).toContain('Sarah');
    expect(html).toContain('Tom');
    // 09:30 on 1 October: summer time, two hours after the instant's hour in UTC.
    expect(html).toContain('09:30');
  });

  it('F020 AC9: a client without upcoming sessions shows the empty text', () => {
    const html = profile(mark);

    expect(html).toContain(escapeHtml(copy.clients.profile.upcomingEmpty));
    expect(html).not.toContain('/sessions/');
  });

  it('AC1: a client without a language follows the workspace’s default, which the profile names', () => {
    const dutch = profile(mark);
    const english = profile(mark, false, 'en');

    expect(dutch).toContain(
      escapeHtml(
        copy.clients.addDialog.localeDefault.replace('{language}', copy.clients.languageNames.nl),
      ),
    );
    expect(english).toContain(
      escapeHtml(
        copy.clients.addDialog.localeDefault.replace('{language}', copy.clients.languageNames.en),
      ),
    );
    expect(dutch).toContain(escapeHtml('mark@example.com'));
  });

  it('shows a language the team set, and the confirmation after an add', () => {
    const html = profile({ ...anna, emailLocale: 'en' }, true);

    expect(html).toContain(`<dd>${escapeHtml(copy.clients.addDialog.localeEn)}</dd>`);
    expect(html).toContain(
      escapeHtml(copy.clients.profile.added.replace('{name}', 'Anna de Vries')),
    );
    expect(profile(anna)).not.toContain('role="status"');
  });

  it('AC7: the profile has Edit for a person who may edit clients, and for no one else', () => {
    const edit = new RegExp(`<button[^>]*>${escapeHtml(copy.clients.profile.edit)}</button>`);

    expect(profile(anna)).toMatch(edit);
    expect(copy.clients.profile.edit).not.toBe(copy.clients.profile.save);
    expect(profile(anna, false, 'nl-NL', false)).not.toMatch(edit);
    // The overview stays for a person who may only view.
    expect(profile(anna, false, 'nl-NL', false)).toContain(escapeHtml('anna@example.com'));
  });

  // E020 #627: the look of TW-02 (docs/design/prototype-v2, *Klantprofiel (TW-02)*).
  it('E020 AC15: the header is the large avatar, the name and Edit; the overview is a card of labelled details', () => {
    const html = profile(anna);

    // The avatar before the name, with the initials in an attribute only.
    expect(html).toMatch(
      /<span[^>]*data-slot="avatar"[^>]*data-initials="AD"[^>]*>.*?<h1[^>]*>Anna de Vries<\/h1>.*?<button[^>]*>/s,
    );
    expect(html).toMatch(/<span[^>]*data-slot="avatar"[^>]*size-14/);
    expect(html).not.toMatch(/>AD</);
    // The overview is in a card, its details a two-column list, label over from value.
    expect(html).toMatch(/data-slot="card"[^>]*>.*?<h2[^>]*>/s);
    expect(html).toMatch(/<dl[^>]*grid-cols-\[auto_1fr\]/);
    expect(html.match(/<dt[^>]*>/g)).toHaveLength(3);
    // The address is shown once, so the page has one place that says it.
    expect(html.match(/anna@example\.com/g)).toHaveLength(1);
  });

  it('E020 AC15: the confirmation after an add is a status in the success tint', () => {
    const html = profile(anna, true);

    expect(html).toMatch(
      /<p[^>]*role="status"[^>]*bg-status-success-bg[^>]*text-status-success-text/,
    );
  });

  it('no placeholder tabs: the profile has the overview and the upcoming sessions (F020) only', () => {
    const html = profile(anna);

    expect(html).not.toContain('role="tab"');
    expect(html).not.toContain('role="tablist"');
    expect(
      html.match(/<h2[^>]*>(.*?)<\/h2>/g)?.map((heading) => heading.replace(/<[^>]*>/g, '')),
    ).toEqual([
      escapeHtml(copy.clients.profile.overview),
      escapeHtml(copy.clients.profile.upcomingTitle),
    ]);
  });

  it('AC2: the email address is a required field in the copy, with a message for a missing one', () => {
    expect(copy.clients.addDialog.emailLabel).not.toMatch(/optio/i);
    expect(copy.clients.addDialog.description).not.toMatch(/alleen een naam|only a name/i);
    expect(copy.clients.addDialog.errors.emailRequired).not.toBe(
      copy.clients.addDialog.errors.emailInvalid,
    );
  });

  it('the copy has none of the forbidden words', () => {
    expect(JSON.stringify(copy.clients)).not.toMatch(
      /\b(cliënt|cliënten|lid|leden|member|members|customer|customers)\b/i,
    );
  });
});
