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

  const view = (
    overrides: Partial<Schemas['Session']> = {},
    canMove = true,
    teamMemberId = 'm-someone-else',
  ) =>
    render(
      locale,
      <SessionView
        workspaceId="w1"
        slug="johns-gym"
        session={{ ...session, ...overrides }}
        client={anna}
        defaultLocale="nl-NL"
        canMove={canMove}
        teamMemberId={teamMemberId}
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

  it('F020 #1414 AC2: the trainer row reads Jij / You only for the trainer whose team-member ID is the viewer’s, not for a namesake', () => {
    const trainerRow = (html: string) =>
      /<dd>([^<]*)<\/dd><dt[^>]*>[^<]*<\/dt><dd><a/.exec(html)?.[1];
    // The session's trainer is Sarah (t1). Another trainer, also called Sarah (t2), looks at it.
    expect(trainerRow(view({}, true, 't1'))).toBe(escapeHtml(copy.sessions.page.you));
    expect(trainerRow(view({}, true, 't2'))).toBe('Sarah');
    expect(view({}, true, 't2')).not.toContain(escapeHtml(copy.sessions.page.you));
  });

  it('AC6: Verplaatsen is there for a person who may plan sessions, and only for them', () => {
    expect(view()).toContain(escapeHtml(copy.sessions.page.reschedule));
    expect(view({}, false)).not.toContain(escapeHtml(copy.sessions.page.reschedule));
    expect(view({}, false)).toContain(escapeHtml(copy.sessions.page.clientProfile));
  });

  describe('F023 Trainer wijzigen', () => {
    const changeLabel = escapeHtml(
      copy.sessions.trainerDialog.titleChange.replace(
        '{word}',
        trainerWordForms('trainer', locale).word,
      ),
    );
    const owned = (overrides: Partial<Schemas['Session']> = {}, canAssign = true) =>
      render(
        locale,
        <SessionView
          workspaceId="w1"
          slug="johns-gym"
          session={{ ...session, ...overrides }}
          client={anna}
          defaultLocale="nl-NL"
          canMove
          teamMemberId="m-john"
          trainerWord={trainerWordForms('trainer', locale)}
          {...(canAssign ? { assign: { workspaceName: "John's Gym", startOpen: false } } : {})}
        />,
      );

    it('AC8: the Owner has Trainer wijzigen on a private session', () => {
      expect(owned()).toContain(changeLabel);
    });

    it('AC12: a person who may not assign (a Trainer) has no Trainer wijzigen', () => {
      expect(owned({}, false)).not.toContain(changeLabel);
    });

    it('a cancelled session cannot be given another trainer', () => {
      expect(owned({ status: 'cancelled' })).not.toContain(changeLabel);
    });
  });

  it('a cancelled session says so and cannot be moved', () => {
    const html = view({ status: 'cancelled' });

    expect(html).toContain(escapeHtml(copy.sessions.page.cancelled));
    expect(html).not.toContain(escapeHtml(copy.sessions.page.reschedule));
  });

  describe('F026 PS-06 and the cancelled session page', () => {
    const cancelAction = escapeHtml(copy.sessions.cancel.action);
    const owned = (overrides: Partial<Schemas['Session']> = {}, canCancel = true) =>
      render(
        locale,
        <SessionView
          workspaceId="w1"
          slug="johns-gym"
          session={{ ...session, ...overrides }}
          client={anna}
          defaultLocale="nl-NL"
          canMove
          canCancel={canCancel}
          teamMemberId="m-sarah"
          trainerWord={trainerWordForms('trainer', locale)}
          assign={{ workspaceName: "John's Gym", startOpen: false }}
        />,
      );
    // Sarah cancelled it on Tuesday 22 September at 12:15 (Amsterdam) at Anna's request.
    const cancellation = (initiator: 'client' | 'workspace') => ({
      cancelledAt: '2026-09-22T10:15:00.000Z',
      cancelledBy: { id: 't1', name: 'Sarah' },
      initiator,
    });
    const day = new Intl.DateTimeFormat(formatting, {
      timeZone: 'Europe/Amsterdam',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date('2026-09-22T10:15:00.000Z'));

    it('AC5: Annuleren is there for a person who may cancel this session, and only for them', () => {
      expect(owned()).toContain(cancelAction);
      expect(owned({}, false)).not.toContain(cancelAction);
    });

    it('AC3: a cancelled session shows who cancelled it and when, at the client’s request, and offers only Klantprofiel', () => {
      const html = owned({ status: 'cancelled', cancellation: cancellation('client') });

      expect(html).toContain(
        escapeHtml(
          `${copy.sessions.page.cancelledBanner
            .replace('{date}', day)
            .replace('{time}', '12:15')
            .replace('{name}', 'Sarah')} · ${copy.sessions.page.cancelledByClient}`,
        ),
      );
      expect(html).toContain(escapeHtml(copy.sessions.page.clientProfile));
      for (const gone of [
        cancelAction,
        copy.sessions.page.reschedule,
        copy.sessions.trainerDialog.titleChange.replace(
          '{word}',
          trainerWordForms('trainer', locale).word,
        ),
      ]) {
        expect(html).not.toContain(`>${escapeHtml(gone)}<`);
      }
    });

    it('AC3: a cancellation by the workspace says so; one whose canceller was removed has no name', () => {
      const byUs = owned({ status: 'cancelled', cancellation: cancellation('workspace') });
      expect(byUs).toContain(escapeHtml(copy.sessions.page.cancelledByWorkspace));
      expect(byUs).not.toContain(escapeHtml(copy.sessions.page.cancelledByClient));
      const noName = owned({
        status: 'cancelled',
        cancellation: { cancelledAt: '2026-09-22T10:15:00.000Z', initiator: 'client' },
      });
      expect(noName).toContain(
        escapeHtml(
          copy.sessions.page.cancelledBannerUnknown
            .replace('{date}', day)
            .replace('{time}', '12:15'),
        ),
      );
    });
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
                teamMemberId: 't1',
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
