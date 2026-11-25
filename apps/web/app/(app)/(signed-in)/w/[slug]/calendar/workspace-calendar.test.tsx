import type { Schemas } from '@fivvi/contract';
import { locales, messages, trainerWordForms } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, render } from '../../../../../../test/render';
import { ClassesProvider } from '../classes/classes-provider';
import { WorkspaceFrame } from '../workspace-frame';
import { type CalendarView, WorkspaceCalendarView } from './workspace-calendar';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => null,
}));

// F014 (spec #458, ticket #529): the Agenda as the API answers it. The week of 21–27 September
// 2026 in Pilot Gym (the seed of the spec's John's Gym): Sven's private session on Tuesday 07:00,
// Kracht 10:00 (Sven, 0/8), Noor's private session 11:00, Kracht 18:00 cancelled, and Boxing on
// Thursday 19:15 without a trainer. The filters live in the browser, so what is drawn here is the
// default: nothing switched off.
type Item = Schemas['WorkspaceCalendarSession'];
const location = {
  id: 'l1',
  name: 'Pilot Gym',
  type: 'organization_location' as const,
  address: null,
  isDefault: true,
};
const base: Item = {
  id: 's-mark',
  type: 'private',
  status: 'scheduled',
  startsAt: '2026-09-22T05:00:00.000Z',
  endsAt: '2026-09-22T06:00:00.000Z',
  timeZone: 'Europe/Amsterdam',
  capacity: 1,
  version: 1,
  location,
  trainer: { id: 'm-sven', name: 'Sven' },
  clientName: 'Mark Jansen',
  clients: [{ clientId: 'c-mark', name: 'Mark Jansen' }],
};
const kracht: Item = {
  ...base,
  id: 's-kracht',
  type: 'group',
  startsAt: '2026-09-22T08:00:00.000Z',
  endsAt: '2026-09-22T09:00:00.000Z',
  capacity: 8,
  booked: 0,
  className: 'Kracht',
  clientName: undefined,
  clients: undefined,
  series: {
    id: 'series-1',
    weekday: 'TU',
    localStartTime: '10:00',
    occurrenceDate: '2026-09-22',
    changedFields: [],
  },
};
const lisa: Item = {
  ...base,
  id: 's-lisa',
  startsAt: '2026-09-22T09:00:00.000Z',
  endsAt: '2026-09-22T10:00:00.000Z',
  trainer: { id: 'm-noor', name: 'Noor' },
  clientName: 'Lisa Smit',
};
const krachtCancelled: Item = {
  ...kracht,
  id: 's-kracht-cancelled',
  status: 'cancelled',
  startsAt: '2026-09-22T16:00:00.000Z',
  endsAt: '2026-09-22T17:00:00.000Z',
};
const boxing: Item = {
  ...kracht,
  id: 's-boxing',
  startsAt: '2026-09-24T17:15:00.000Z',
  endsAt: '2026-09-24T18:15:00.000Z',
  className: 'Boxing',
  trainer: undefined,
  series: undefined,
};
const week: Schemas['WorkspaceCalendar'] = {
  from: '2026-09-21',
  to: '2026-09-27',
  timeZone: 'Europe/Amsterdam',
  items: [base, kracht, lisa, krachtCancelled, boxing],
};
const trainers = [
  { id: 'm-sven', name: 'Sven' },
  { id: 'm-noor', name: 'Noor' },
];
const access = {
  canMoveAny: true,
  canMoveOwn: true,
  canChangeClasses: true,
  canSeeClients: true,
  canManageCalendar: true,
  canAssign: true,
  canCancelAny: true,
  canCancelOwn: true,
  canCopyLink: true,
  teamMemberId: 'm-paula',
};

describe.each(locales)('F014 Agenda in %s', (locale) => {
  const copy = messages[locale];
  const words = trainerWordForms('trainer', locale);
  /** A message with the workspace's word for the people who teach filled in (F068). */
  const worded = (message: string) =>
    Object.entries(words).reduce(
      (text, [name, word]) => text.replaceAll(`{${name}}`, word),
      message,
    );
  const t = {
    ...copy.workspaceCalendar,
    noTrainer: worded(copy.workspaceCalendar.noTrainer),
    noTrainerMark: worded(copy.workspaceCalendar.noTrainerMark),
    columnTrainer: worded(copy.workspaceCalendar.columnTrainer),
  };
  const shared = copy.myCalendar;
  const view = (shown: CalendarView, overrides: Partial<typeof week> = {}, date = '2026-09-22') =>
    render(
      locale,
      <WorkspaceCalendarView
        calendar={{ ...week, ...overrides }}
        date={date}
        today="2026-09-22"
        initialView={shown}
        trainers={trainers}
        slug="pilot-gym"
        workspaceId="w1"
        workspaceName="Pilot Gym"
        accountId="a1"
        access={access}
        trainerWord={words}
      />,
    );
  /** The accessible names of the blocks, in the order of the page. */
  const names = (html: string) =>
    [...html.matchAll(/<button[^>]*aria-haspopup="dialog" aria-label="([^"]*)"/g)].map(
      ([, name]) => name,
    );

  it('AC1: every block of the week starts with its type in words, Boxing says it has no trainer, the legend names the types', () => {
    const html = view('week');

    expect(names(html)).toEqual([
      expect.stringMatching(new RegExp(`^${shared.typePrivate} · Mark Jansen, .*07:00`)),
      expect.stringMatching(new RegExp(`^${shared.typeGroup} · Kracht, .*10:00`)),
      expect.stringMatching(new RegExp(`^${shared.typePrivate} · Lisa Smit, .*11:00`)),
      expect.stringMatching(
        new RegExp(`^${shared.typeGroup} · Kracht, .*18:00.*${shared.cancelled}$`),
      ),
      expect.stringMatching(
        new RegExp(`^${shared.typeGroup} · Boxing, .*19:15.*, ${escapeHtml(t.noTrainerMark)}`),
      ),
    ]);
    expect(html).toContain(escapeHtml(t.noTrainerMark));
    expect(html).toContain(shared.blockBooked.replace('{booked}', '0').replace('{capacity}', '8'));
    expect(html).toMatch(
      new RegExp(`aria-label="${shared.legend}"[^>]*>.*${shared.typePrivate}.*${shared.typeGroup}`),
    );
    // The cancelled block is struck through; Open Gym is nowhere.
    expect(html).toContain('line-through');
    expect(html).not.toMatch(/Open Gym/);
  });

  it('the legend names every state the spec lists: scheduled, cancelled and needs action', () => {
    const legend =
      view('week').match(
        /aria-label="[^"]*"[^>]*class="flex flex-wrap items-center[^>]*>.*?<\/ul>/,
      )?.[0] ?? '';
    expect(legend).toContain(t.legendScheduled);
    expect(legend).toContain(shared.cancelled);
    expect(legend).toContain(t.legendNeedsAction);
  });

  it('an empty week offers + Groepsles to a person who manages classes, and to nobody else', () => {
    const empty = { items: [] };
    const asOwner = render(
      locale,
      <ClassesProvider workspaceId="w1" slug="pilot-gym" teamMemberId="m-paula" trainerWord={words}>
        <WorkspaceCalendarView
          calendar={{ ...week, ...empty }}
          date="2026-09-22"
          today="2026-09-22"
          initialView="week"
          trainers={trainers}
          slug="pilot-gym"
          workspaceId="w1"
          workspaceName="Pilot Gym"
          accountId="a1"
          access={access}
          trainerWord={words}
        />
      </ClassesProvider>,
    );
    expect(asOwner).toContain(t.emptyWeek);
    expect(asOwner).toContain(escapeHtml(t.newGroup));
    expect(view('week', empty)).toContain(t.emptyWeek);
    expect(view('week', empty)).not.toContain(escapeHtml(t.newGroup));
  });

  it('AC3: Trainers lists the team and Geen trainer, Type lists Privé and Groepsles; all are on', () => {
    const html = view('week');
    for (const label of [
      'Sven',
      'Noor',
      t.noTrainer,
      shared.optionPrivate,
      shared.optionGroup,
      shared.showCancelled,
    ]) {
      expect(html).toMatch(new RegExp(`<input[^>]*type="checkbox"[^>]*checked=""[^>]*/>${label}`));
    }
    expect(html).toContain(words.Words);
  });

  it('AC5: the list is a table per day, with headers, and says which day is today', () => {
    const html = view('list');

    expect(html).toContain('<table');
    for (const column of [
      shared.columnTime,
      shared.columnType,
      shared.columnSession,
      t.columnTrainer,
      t.columnLocation,
      shared.columnStatus,
    ]) {
      expect(html).toMatch(new RegExp(`<th[^>]*scope="col"[^>]*>${column}</th>`));
    }
    // One table per day with sessions: Tuesday (today) and Thursday.
    expect(html.match(/<h3/g)).toHaveLength(2);
    expect(html).toMatch(new RegExp(`<h3[^>]*>[^<]*22[^<]*· ${t.todayMark}`));
    expect(html).toContain(t.typePrivateSession);
    expect(html).toContain(t.typeGroupClass);
  });

  it('AC13: the day the clocks go back carries ◐ with its note, and 02:00 is a row twice when a block starts before it', () => {
    const clocks = { from: '2026-10-19', to: '2026-10-25' };
    const html = view(
      'week',
      {
        ...clocks,
        items: [
          { ...base, startsAt: '2026-10-20T08:00:00.000Z', endsAt: '2026-10-20T09:00:00.000Z' },
        ],
      },
      '2026-10-22',
    );
    expect(html).toContain('◐');
    expect(html).toContain(shared.clockBack);
    expect(html.match(/>02:00</g) ?? []).toHaveLength(0);
    const early = view(
      'week',
      {
        ...clocks,
        items: [
          { ...base, startsAt: '2026-10-24T23:30:00.000Z', endsAt: '2026-10-25T00:15:00.000Z' },
        ],
      },
      '2026-10-22',
    );
    expect(early.match(/>02:00</g)).toHaveLength(2);
  });

  /** The calendar of a person who can plan: with the class dialogs of the frame around it. */
  const asPerson = (person: typeof access, shown: CalendarView, items = week.items) =>
    render(
      locale,
      <ClassesProvider workspaceId="w1" slug="pilot-gym" teamMemberId="m-paula" trainerWord={words}>
        <WorkspaceCalendarView
          calendar={{ ...week, items }}
          date="2026-09-22"
          today="2026-09-22"
          initialView={shown}
          trainers={trainers}
          slug="pilot-gym"
          workspaceId="w1"
          workspaceName="Pilot Gym"
          accountId="a1"
          access={person}
          trainerWord={words}
        />
      </ClassesProvider>,
    );

  it('AC7: the Owner’s columns take a click on an empty moment, in the week and in the day view', () => {
    for (const shown of ['week', 'day'] as const) {
      const html = asPerson(access, shown);
      expect(html).toContain('cursor-cell');
      expect(html).toMatch(/data-column="/);
    }
    // The list has no grid to click in.
    expect(asPerson(access, 'list')).not.toContain('cursor-cell');
  });

  it('AC12: a Trainer’s columns take no click on an empty moment and no block is movable', () => {
    const trainer = { ...access, canManageCalendar: false, canMoveAny: false };
    for (const shown of ['week', 'day'] as const) {
      const html = asPerson(trainer, shown);
      expect(html).not.toContain('cursor-cell');
      expect(html).not.toContain('data-movable=""');
    }
  });

  it('WC-07: the Owner can drag a scheduled block, not a cancelled one, and nobody can in the list', () => {
    const html = asPerson(access, 'week');
    // Mark, Kracht, Lisa and Boxing are scheduled; the cancelled Kracht stays where it is.
    expect(html.match(/data-movable=""/g)).toHaveLength(4);
    expect(asPerson(access, 'list')).not.toContain('data-movable=""');
  });

  it('AC4: the day view has a column per trainer, Geen trainer only on a day that needs it', () => {
    const header = (html: string) =>
      html.match(/data-slot="week-grid-header".*?data-slot="week-grid-body"/)?.[0] ?? '';
    const tuesday = header(view('day', {}, '2026-09-22'));
    expect(tuesday).toContain('Sven');
    expect(tuesday).toContain('Noor');
    expect(tuesday).not.toContain(t.noTrainer);
    expect(header(view('day', {}, '2026-09-24'))).toContain(t.noTrainer);
  });

  it('F023 AC9: a past session of a removed trainer shows in a column with her name, next to the current trainers', () => {
    const header = (html: string) =>
      html.match(/data-slot="week-grid-header".*?data-slot="week-grid-body"/)?.[0] ?? '';
    // Sarah left the team: she is not in `trainers`, but her session of Tuesday still carries her.
    const past: Item = {
      ...base,
      id: 's-sarah',
      startsAt: '2026-09-22T12:00:00.000Z',
      endsAt: '2026-09-22T13:00:00.000Z',
      trainer: { id: 'm-sarah', name: 'Sarah' },
      clientName: 'Eva de Vries',
    };
    const html = view('day', { items: [...week.items, past] }, '2026-09-22');
    const columns = header(html);
    expect(columns).toContain('Sarah');
    expect(columns).toContain('Sven');
    expect(columns).toContain('Noor');
    // No Geen trainer column: her session is not without a trainer.
    expect(columns).not.toContain(t.noTrainer);
    // Her block is in the grid, once, under the name she carries.
    expect(names(html).filter((name) => name?.includes('Eva de Vries'))).toEqual([
      expect.stringContaining('Sarah'),
    ]);
    // A day without her sessions has no column for her.
    expect(header(view('day', { items: [...week.items, past] }, '2026-09-24'))).not.toContain(
      'Sarah',
    );
    // The week and the list show it too.
    expect(names(view('week', { items: [...week.items, past] }))).toContainEqual(
      expect.stringContaining('Eva de Vries'),
    );
  });
});

describe.each(locales)('F014 the sidebar of a workspace in %s', (locale) => {
  const frame = (capabilities: Schemas['MyWorkspace']['capabilities']) =>
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
      >
        <hr />
      </WorkspaceFrame>,
    );

  it('AC1: Agenda is a section of the workspace for everyone with calendar.read, and for nobody without it', () => {
    expect(frame(['calendar.read', 'clients.view'])).toContain(`href="/w/johns-gym/calendar"`);
    expect(frame(['calendar.read'])).toContain(messages[locale].workspaceNav.calendar);
    expect(frame(['clients.view'])).not.toContain('/calendar"');
  });
});
