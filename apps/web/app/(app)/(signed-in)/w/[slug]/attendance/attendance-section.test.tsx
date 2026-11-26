import type { Schemas } from '@fivvi/contract';
import { locales, messages, trainerWordForms } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, render } from '../../../../../../test/render';
import { ClassDateView } from '../classes/class-date-view';
import { SessionView } from '../sessions/session-view';
import { AttendanceSection } from './attendance-section';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => null,
}));

type Attendance = Schemas['Attendance'];

// Tuesday 22 September 2026: the class starts 18:00 Amsterdam (16:00Z), attendance opens 17:30.
const BEFORE_OPENS = '2026-09-22T15:20:00.000Z';
const OPEN = '2026-09-22T16:10:00.000Z';

const people: Attendance['participants'] = [
  { clientId: 'c1', name: 'Anna de Vries', status: 'no_show' },
  { clientId: 'c2', name: 'Bram Jansen', status: 'booked' },
  { clientId: 'c3', name: 'Chris Bakker', status: 'cancelled' },
];

const attendance: Attendance = {
  sessionId: 's1',
  type: 'group',
  status: 'scheduled',
  attendanceOpensAt: '2026-09-22T15:30:00.000Z',
  canTakeAttendance: true,
  participants: people,
  summary: { attended: 0, noShow: 1, open: 1, cancelled: 1 },
};

const session = {
  id: 's1',
  status: 'scheduled',
  startsAt: '2026-09-22T16:00:00.000Z',
  endsAt: '2026-09-22T17:00:00.000Z',
  timeZone: 'Europe/Amsterdam',
  capacity: 8,
  version: 1,
  location: {
    id: 'l1',
    name: "John's Gym",
    type: 'organization_location',
    address: null,
    isDefault: true,
  },
  trainer: { id: 't1', name: 'Sarah' },
} as const;

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F025 attendance on the web in %s', (locale) => {
  const copy = messages[locale].attendance;
  const section = (
    overrides: Partial<Attendance>,
    now = OPEN,
    kind: 'private' | 'group' = 'group',
  ) =>
    render(
      locale,
      <AttendanceSection
        workspaceId="w1"
        sessionId="s1"
        kind={kind}
        timeZone="Europe/Amsterdam"
        initial={{ ...attendance, ...overrides }}
        now={now}
      />,
    );
  const radios = (html: string) => html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];

  it('AC4: CO-06 lists each participant with a radio group Geboekt · Aanwezig · Niet verschenen, the current one checked, and the summary', () => {
    const html = section({});

    expect(html).toContain(
      escapeHtml(
        copy.summary.replace('{attended}', '0').replace('{noShow}', '1').replace('{open}', '1'),
      ),
    );
    // Anna (no-show) and Bram (booked) have three radios each; Chris cancelled has none.
    expect(radios(html)).toHaveLength(6);
    for (const label of [copy.status.booked, copy.status.attended, copy.status.noShow]) {
      expect(html.split(`>${escapeHtml(label)}</label>`).length - 1).toBe(2);
    }
    expect(
      radios(html)
        .filter((radio) => radio.includes('checked=""'))
        .map((radio) => /value="([^"]+)"/.exec(radio)?.[1]),
    ).toEqual(['no_show', 'booked']);
    expect(html).toContain(escapeHtml(copy.groupLabel.replace('{name}', 'Anna de Vries')));
    expect(html).toContain('Chris Bakker');
    expect(html).toContain(escapeHtml(copy.status.cancelled));
    // The card's heading joins the two words from the catalog; a private session says just Aanwezigheid.
    expect(html).toContain(
      escapeHtml(
        copy.participantsTitle
          .replace('{participants}', copy.participants)
          .replace('{title}', copy.title),
      ),
    );
  });

  it('AC3: a private session has the same group for its one client and no summary', () => {
    const html = section(
      { type: 'private', participants: [people[0] as Attendance['participants'][number]] },
      OPEN,
      'private',
    );

    expect(radios(html)).toHaveLength(3);
    expect(html).not.toContain(escapeHtml(copy.everyone));
    expect(html).not.toContain('role="status"');
  });

  it('AC5: before attendance opens the text names the time in the workspace zone', () => {
    const html = section({}, BEFORE_OPENS);

    expect(html).toContain(escapeHtml(copy.tooEarly.replace('{time}', '17:30')));
    expect(html).not.toContain(escapeHtml(copy.everyone));
  });

  it('AC6: a cancelled class says no attendance is needed and shows nothing to tap', () => {
    const html = section({ status: 'cancelled' });

    expect(html).toContain(escapeHtml(copy.cancelledClass));
    expect(radios(html)).toHaveLength(0);
    expect(html).not.toContain('<button');
    expect(section({ status: 'cancelled', type: 'private' }, OPEN, 'private')).toContain(
      escapeHtml(copy.cancelledSession),
    );
  });

  it('Iedereen aanwezig: an outline button in the card header, for a class that has started and has participants', () => {
    const html = section({});

    expect(html).toMatch(new RegExp(`<button[^>]*>${escapeHtml(copy.everyone)}</button>`));
    // Not for someone who may not take attendance, and not for a class without participants.
    expect(section({ canTakeAttendance: false })).not.toContain(escapeHtml(copy.everyone));
    expect(
      section({ participants: [], summary: { attended: 0, noShow: 0, open: 0, cancelled: 0 } }),
    ).not.toContain(escapeHtml(copy.everyone));
  });

  it('AC14: shows names and statuses only', () => {
    const html = section({});
    expect(html).not.toMatch(/mailto:|tel:|example\.com/);
  });

  describe('the pages', () => {
    const word = trainerWordForms('trainer', locale);

    it('AC3: the private session page shows the attendance section between the facts and the actions', () => {
      const html = render(
        locale,
        <SessionView
          workspaceId="w1"
          slug="johns-gym"
          session={{
            ...session,
            type: 'private',
            participants: [{ clientId: 'c1', name: 'Anna de Vries', attendanceStatus: 'booked' }],
          }}
          client={{ id: 'c1', name: 'Anna de Vries', email: 'anna@example.com', emailLocale: null }}
          defaultLocale="nl-NL"
          canMove
          teamMemberId="m1"
          trainerWord={word}
          attendance={{
            ...attendance,
            type: 'private',
            participants: [{ clientId: 'c1', name: 'Anna de Vries', status: 'booked' }],
          }}
          now={OPEN}
        />,
      );

      expect(html).toContain(escapeHtml(copy.title));
      expect(radios(html)).toHaveLength(3);
    });

    it('AC4: CO-01 shows CO-06 inline for a class date with participants, and nothing for one without', () => {
      const date = {
        ...session,
        type: 'group',
        groupClass: { id: 'c1', nameNl: 'Kracht', nameEn: 'Strength' },
        participants: [
          { clientId: 'c1', name: 'Anna de Vries', attendanceStatus: 'no_show' },
          { clientId: 'c2', name: 'Bram Jansen', attendanceStatus: 'booked' },
        ],
      } as const;
      const view = (participants: Attendance['participants']) =>
        render(
          locale,
          <ClassDateView
            workspaceId="w1"
            slug="johns-gym"
            session={{ ...date, participants: [...date.participants] }}
            canManage
            canCopyLink={false}
            ownDate={false}
            trainerWord={word}
            attendance={{ ...attendance, participants }}
            now={OPEN}
          />,
        );

      expect(radios(view(people))).toHaveLength(6);
      expect(radios(view([]))).toHaveLength(0);
      expect(view([])).not.toContain(escapeHtml(copy.everyone));
    });
  });
});
