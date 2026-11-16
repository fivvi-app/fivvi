import type { Schemas } from '@fivvi/contract';
import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { escapeHtml, render } from '../../../../../../test/render';
import { type CalendarView, MyCalendarView } from './my-calendar';

// F013 AC10, AC14: *Mijn agenda* as the API answers it. Tuesday 22 September 2026, Sarah: Anna
// 09:00–10:00 (Sarah Personal Training), Mark 11:00–12:00 (John's Gym), "Kracht" 15:00–16:00
// (John's Gym, 0/8) and "Kracht" 18:00–19:00 (cancelled). The filters live in the browser, so
// what is drawn here is the default: nothing switched off.
type Calendar = Schemas['MySessions'];
type Item = Schemas['PersonalSession'];

const own = { id: 'w-own', slug: 'sarah-personal-training', name: 'Sarah Personal Training' };
const gym = { id: 'w-gym', slug: 'johns-gym', name: "John's Gym" };

const anna: Item = {
  sessionId: 's-anna',
  workspace: own,
  type: 'private',
  status: 'scheduled',
  startsAt: '2026-09-22T07:00:00.000Z',
  endsAt: '2026-09-22T08:00:00.000Z',
  timeZone: 'Europe/Amsterdam',
  capacity: 1,
  clientName: 'Anna de Vries',
};
const mark: Item = {
  ...anna,
  sessionId: 's-mark',
  workspace: gym,
  startsAt: '2026-09-22T09:00:00.000Z',
  endsAt: '2026-09-22T10:00:00.000Z',
  clientName: 'Mark Jansen',
};
const kracht: Item = {
  sessionId: 's-kracht',
  workspace: gym,
  type: 'group',
  status: 'scheduled',
  startsAt: '2026-09-22T13:00:00.000Z',
  endsAt: '2026-09-22T14:00:00.000Z',
  timeZone: 'Europe/Amsterdam',
  capacity: 8,
  booked: 0,
  className: 'Kracht',
};
const krachtCancelled: Item = {
  ...kracht,
  sessionId: 's-kracht-cancelled',
  status: 'cancelled',
  startsAt: '2026-09-22T16:00:00.000Z',
  endsAt: '2026-09-22T17:00:00.000Z',
};
const openGym: Item = {
  ...kracht,
  sessionId: 's-open-gym',
  type: 'open_gym',
  className: undefined,
};

const week: Calendar = {
  from: '2026-09-21',
  to: '2026-09-27',
  timeZone: 'Europe/Amsterdam',
  workspaceCount: 2,
  items: [anna, mark, kracht, krachtCancelled, openGym],
};
const workspaces = [
  { id: gym.id, name: gym.name },
  { id: own.id, name: own.name },
];

describe.each(locales)('F013 Mijn agenda in %s', (locale) => {
  const copy = messages[locale].myCalendar;
  const view = (
    shown: CalendarView,
    overrides: Partial<Calendar> = {},
    { date = '2026-09-22', crew = workspaces } = {},
  ) =>
    render(
      locale,
      <MyCalendarView
        calendar={{ ...week, ...overrides }}
        date={date}
        today="2026-09-22"
        initialView={shown}
        workspaces={crew}
      />,
    );
  /** The accessible names of the session links, in the order of the page. */
  const names = (html: string) =>
    [...html.matchAll(/<a[^>]*aria-label="([^"]*)"[^>]*href="\/w\//g)].map(([, name]) => name);

  it('AC10: every block starts with its type in words, then the name, and names its workspace', () => {
    const html = view('week');

    expect(names(html)).toEqual([
      expect.stringMatching(new RegExp(`^${copy.typePrivate} · Anna de Vries, 09:00`)),
      expect.stringMatching(new RegExp(`^${copy.typePrivate} · Mark Jansen, 11:00`)),
      expect.stringMatching(new RegExp(`^${copy.typeGroup} · Kracht, 15:00`)),
      expect.stringMatching(new RegExp(`^${copy.typeGroup} · Kracht, 18:00`)),
    ]);
    for (const name of names(html)) {
      expect(name).toMatch(/Sarah Personal Training|John&#x27;s Gym/);
    }
    expect(html).toContain(escapeHtml("John's Gym"));
    expect(html).toContain('Sarah Personal Training');
    expect(html).toContain(copy.blockBooked.replace('{booked}', '0').replace('{capacity}', '8'));
  });

  it('AC10: the cancelled block says so, struck through, and is grey', () => {
    const html = view('week');
    const name = names(html)[3] ?? '';

    expect(name).toContain(copy.cancelled);
    expect(html).toContain('line-through');
    expect(html).toContain('bg-muted');
  });

  it('AC10: the legend names Privé and Groep, and Open Gym is nowhere (it comes later)', () => {
    const html = view('week');

    expect(html).toMatch(
      new RegExp(`aria-label="${copy.legend}"[^>]*>.*${copy.typePrivate}.*${copy.typeGroup}`),
    );
    expect(html).not.toContain('s-open-gym');
    expect(html).not.toMatch(/Open Gym/);
  });

  it('AC10: the filters: Type with Privé, Groepsles and Geannuleerde tonen; Werkruimte with both workspaces', () => {
    const html = view('week');

    for (const label of [copy.optionPrivate, copy.optionGroup, copy.showCancelled]) {
      expect(html).toMatch(new RegExp(`<input[^>]*type="checkbox"[^>]*checked=""[^>]*/>${label}`));
    }
    expect(html).toContain(copy.filterWorkspace);
    expect(html).toMatch(/type="checkbox"[^>]*checked=""[^>]*\/>Sarah Personal Training/);
  });

  it('AC2: with one workspace there is no workspace filter and no block names one', () => {
    const html = view(
      'week',
      { workspaceCount: 1, items: [mark, kracht] },
      { crew: [{ id: gym.id, name: gym.name }] },
    );

    expect(html).not.toContain(copy.filterWorkspace);
    expect(names(html)).toEqual([
      expect.not.stringContaining('John'),
      expect.not.stringContaining('John'),
    ]);
  });

  it('AC6: the day the clocks go back carries ◐ with the note, and no other day does', () => {
    const html = view(
      'week',
      { from: '2026-10-19', to: '2026-10-25', items: [] },
      { date: '2026-10-25' },
    );
    // No sessions: the message replaces the grid, so check a week with one.
    const withSession = view(
      'week',
      {
        from: '2026-10-19',
        to: '2026-10-25',
        items: [
          { ...anna, startsAt: '2026-10-20T07:00:00.000Z', endsAt: '2026-10-20T08:00:00.000Z' },
        ],
      },
      { date: '2026-10-25' },
    );

    expect(html).toContain(copy.emptyWeek);
    expect(withSession.match(/◐/g)).toHaveLength(1);
    expect(withSession).toContain(copy.clockBack);
    expect(view('week')).not.toContain('◐');
  });

  it('AC6: the week runs Monday to Sunday', () => {
    const html = view('week');
    const formatting = locale === 'en' ? 'en-GB' : 'nl-NL';
    const heads = Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(formatting, {
        timeZone: 'UTC',
        weekday: 'short',
        day: 'numeric',
      }).format(new Date(Date.UTC(2026, 8, 21 + index, 12))),
    );

    expect(heads[0]).toMatch(/21/);
    let at = 0;
    for (const head of heads) {
      const found = html.indexOf(head, at);
      expect(found, head).toBeGreaterThanOrEqual(at);
      at = found;
    }
  });

  it('the list is a real table with column headers, a caption and a link for each session', () => {
    const html = view('list');

    expect(html).toMatch(/<table[^>]*>\s*<caption[^>]*>/);
    for (const column of [
      copy.columnDay,
      copy.columnTime,
      copy.columnSession,
      copy.columnType,
      copy.columnWorkspace,
      copy.columnStatus,
    ]) {
      expect(html).toMatch(new RegExp(`<th scope="col"[^>]*>${column}</th>`));
    }
    expect(html.match(/<tr /g)).toHaveLength(5);
    expect(html).toContain('Anna de Vries');
    expect(html).toContain(copy.typeGroup);
    expect(html).toContain('href="/w/johns-gym/sessions/s-mark"');
    expect(html).not.toContain('data-slot="week-grid"');
  });

  it('the day view puts a column per workspace and only that day’s sessions', () => {
    const html = view('day', {
      items: [
        ...week.items,
        {
          ...anna,
          sessionId: 's-other',
          startsAt: '2026-09-23T07:00:00.000Z',
          endsAt: '2026-09-23T08:00:00.000Z',
        },
      ],
    });

    expect(names(html)).toHaveLength(4);
    expect(html).not.toContain('s-other');
    const header = html.split('data-slot="week-grid-body"')[0] ?? '';
    expect(header).toContain(escapeHtml("John's Gym"));
    expect(header).toContain('Sarah Personal Training');
  });

  it('AC5: an empty day or week says so', () => {
    expect(view('day', { items: [] })).toContain(copy.emptyDay);
    expect(view('week', { items: [] })).toContain(copy.emptyWeek);
    expect(view('list', { items: [] })).toContain(copy.emptyWeek);
  });

  it('moves a day in the day view and a week in the others, in the view that was chosen', () => {
    expect(view('day')).toContain('href="/me/calendar?date=2026-09-23&amp;view=day"');
    expect(view('week')).toContain('href="/me/calendar?date=2026-09-29&amp;view=week"');
    expect(view('week')).toContain('href="/me/calendar?date=2026-09-15&amp;view=week"');
  });
});
