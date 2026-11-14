import type { Schemas } from '@fivvi/contract';
import { locales, messages, trainerWordForms } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { OWNER, TRAINER } from '../../../../../../test/capabilities';
import { escapeHtml, render } from '../../../../../../test/render';
import { WorkspaceFrame } from '../workspace-frame';
import { SessionView } from './session-view';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => null,
}));

const session: Schemas['Session'] = {
  id: 's1',
  type: 'private',
  status: 'scheduled',
  startsAt: '2026-09-24T07:00:00.000Z',
  endsAt: '2026-09-24T08:00:00.000Z',
  timeZone: 'Europe/Amsterdam',
  capacity: 1,
  version: 1,
  location: {
    id: 'l1',
    name: "John's Gym",
    type: 'organization_location',
    address: null,
    isDefault: true,
  },
  trainer: { id: 't1', name: 'Sarah' },
  participants: [{ clientId: 'c1', name: 'Anna de Vries', attendanceStatus: 'booked' }],
};
const anna = { id: 'c1', name: 'Anna de Vries', email: 'anna@example.com', emailLocale: null };

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F020 the session page and + Nieuw in %s', (locale) => {
  const copy = messages[locale];
  const formatting = locale === 'en' ? 'en-GB' : 'nl-NL';

  const view = (overrides: Partial<Schemas['Session']> = {}, canMove = true) =>
    render(
      locale,
      <SessionView
        workspaceId="w1"
        slug="johns-gym"
        session={{ ...session, ...overrides }}
        client={anna}
        defaultLocale="nl-NL"
        canMove={canMove}
        trainerWord={trainerWordForms('trainer', locale)}
      />,
    );

  it('AC1: the page names the client, the date and time range, the location, the trainer and links to the client', () => {
    const html = view();

    const longDay = new Intl.DateTimeFormat(formatting, {
      timeZone: 'Europe/Amsterdam',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(session.startsAt));
    expect(html).toContain(
      `<h1 class="min-w-0 text-[22px] font-semibold tracking-tight">${escapeHtml(copy.sessions.page.heading.replace('{client}', 'Anna de Vries'))}</h1>`,
    );
    expect(html).toContain(
      escapeHtml(
        copy.sessions.page.timeRange
          .replace('{date}', longDay)
          .replace('{start}', '09:00')
          .replace('{end}', '10:00'),
      ),
    );
    expect(html).toContain('John&#x27;s Gym');
    expect(html).toContain('Sarah');
    expect(html).toContain('href="/w/johns-gym/clients/c1"');
    expect(html).toContain(escapeHtml(copy.sessions.page.clientProfile));
  });

  it('AC6: Verplaatsen is there for a person who may plan sessions, and only for them', () => {
    expect(view()).toContain(escapeHtml(copy.sessions.page.reschedule));
    expect(view({}, false)).not.toContain(escapeHtml(copy.sessions.page.reschedule));
    expect(view({}, false)).toContain(escapeHtml(copy.sessions.page.clientProfile));
  });

  it('a cancelled session says so and cannot be moved', () => {
    const html = view({ status: 'cancelled' });

    expect(html).toContain(escapeHtml(copy.sessions.page.cancelled));
    expect(html).not.toContain(escapeHtml(copy.sessions.page.reschedule));
  });

  it('a session without a trainer (the profile ended) says so with the workspace’s word', () => {
    const html = view({ trainer: undefined });

    expect(html).toContain(
      escapeHtml(
        copy.sessions.page.noTrainer.replace('{word}', trainerWordForms('trainer', locale).word),
      ),
    );
  });

  const frame = (capabilities: typeof OWNER, newSession?: boolean, clientsManage = true) =>
    render(
      locale,
      <WorkspaceFrame
        name="John's Gym"
        slug="johns-gym"
        teamRole="trainer"
        workspaces={[]}
        canCreateWorkspace={false}
        capabilities={capabilities}
        personName="Sarah"
        quickAdd={clientsManage ? { workspaceId: 'w1', defaultLocale: 'nl-NL' } : undefined}
        newSession={
          newSession
            ? {
                workspaceId: 'w1',
                email: 'sarah@example.com',
                personName: 'Sarah',
                forAnyTrainer: false,
                canAddClients: clientsManage,
                trainerWord: trainerWordForms('trainer', locale),
              }
            : undefined
        }
      >
        <hr />
      </WorkspaceFrame>,
    );

  it('AC1: the top bar has + Nieuw for a person who may plan sessions, even without the right to add clients', () => {
    const html = frame(['clients.view', 'session.private.manage.own'], true, false);

    expect(html).toMatch(
      new RegExp(
        `<button[^>]*aria-expanded="false"[^>]*>.*${escapeHtml(copy.workspaceNav.new)}</button>`,
      ),
    );
  });

  it('F004: + Nieuw needs a capability, not a role: nothing to create, no menu', () => {
    const html = frame(['clients.view'], false, false);

    expect(html).not.toContain(escapeHtml(copy.workspaceNav.new));
    expect(frame(TRAINER, true)).toContain(escapeHtml(copy.workspaceNav.new));
    expect(frame(OWNER, true)).toContain(escapeHtml(copy.workspaceNav.new));
  });
});
