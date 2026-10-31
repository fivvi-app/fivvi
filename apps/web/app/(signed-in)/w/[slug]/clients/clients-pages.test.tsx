import type { Schemas } from '@fivvi/contract';
import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { OWNER, TRAINER } from '../../../../../test/capabilities';
import { escapeHtml, render } from '../../../../../test/render';
import { WorkspaceFrame } from '../workspace-frame';
import { ClientList } from './client-list';
import { ClientProfile } from './client-profile';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

const anna: Schemas['Client'] = {
  id: 'c1',
  name: 'Anna de Vries',
  email: 'anna@example.com',
  emailLocale: null,
};
const mark: Schemas['Client'] = { id: 'c2', name: 'Mark Jansen', email: null, emailLocale: null };

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
          `<a[^>]*href="/w/johns-gym/clients"[^>]*>${escapeHtml(copy.workspaceNav.clients)}</a>`,
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

  it('AC6: the list shows each client’s name and, when there is one, the email address, linking to the profile', () => {
    const html = list([anna, mark]);

    expect(html).toMatch(new RegExp(`<h1[^>]*>${escapeHtml(copy.clients.title)}</h1>`));
    expect(html).toMatch(
      /<a[^>]*href="\/w\/johns-gym\/clients\/c1"[^>]*><span[^>]*>Anna de Vries<\/span><span[^>]*>anna@example\.com<\/span><\/a>/,
    );
    expect(html).toMatch(
      /<a[^>]*href="\/w\/johns-gym\/clients\/c2"[^>]*><span[^>]*>Mark Jansen<\/span><\/a>/,
    );
    expect(html).toContain(`placeholder="${escapeHtml(copy.clients.searchPlaceholder)}"`);
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
  ) =>
    render(
      locale,
      <ClientProfile
        client={client}
        slug="johns-gym"
        defaultLocale={defaultLocale}
        added={added}
      />,
    );

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
    expect(dutch).toContain(escapeHtml(copy.clients.profile.noEmail));
  });

  it('shows a language the team set, and the confirmation after an add', () => {
    const html = profile({ ...anna, emailLocale: 'en' }, true);

    expect(html).toContain(`<dd>${escapeHtml(copy.clients.addDialog.localeEn)}</dd>`);
    expect(html).toContain(
      escapeHtml(copy.clients.profile.added.replace('{name}', 'Anna de Vries')),
    );
    expect(profile(anna)).not.toContain('role="status"');
  });

  it('the copy has none of the forbidden words', () => {
    expect(JSON.stringify(copy.clients)).not.toMatch(
      /\b(cliënt|cliënten|lid|leden|member|members|customer|customers)\b/i,
    );
  });
});
