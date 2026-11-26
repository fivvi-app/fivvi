import type { Schemas } from '@fivvi/contract';
import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, render } from '../../../../../../test/render';
import { MyDayView } from './my-day';

// The nudge refreshes the page through the router, which exists only in a running app.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

// F013 AC1, AC2, AC4, AC5, AC9: *Mijn dag* as the API answers it. Tuesday 22 September 2026,
// Sarah at 08:35 (06:35 UTC): Anna 09:00–10:00 (Sarah Personal Training), Mark 11:00–12:00
// (John's Gym), "Kracht" 15:00–16:00 (John's Gym, 0/8) and "Kracht" 18:00–19:00 (cancelled).
type Day = Schemas['MyDay'];
type Item = Schemas['PersonalSession'];

const own = { id: 'w-own', slug: 'sarah-personal-training', name: 'Sarah Personal Training' };
const gym = { id: 'w-gym', slug: 'johns-gym', name: "John's Gym" };
const place = (name: string): Item['location'] => ({
  id: `l-${name}`,
  name,
  type: 'organization_location',
  address: null,
  isDefault: true,
});

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
  location: place('Studio Zuid'),
};
const mark: Item = {
  sessionId: 's-mark',
  workspace: gym,
  type: 'private',
  status: 'scheduled',
  startsAt: '2026-09-22T09:00:00.000Z',
  endsAt: '2026-09-22T10:00:00.000Z',
  timeZone: 'Europe/Amsterdam',
  capacity: 1,
  clientName: 'Mark Jansen',
  location: place("John's Gym Centrum"),
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

const day: Day = {
  date: '2026-09-22',
  timeZone: 'Europe/Amsterdam',
  workspaceCount: 2,
  workspaces: [
    { ...gym, sessionTypes: ['private', 'group'] },
    { ...own, sessionTypes: ['private'] },
  ],
  showsKindLabel: true,
  items: [anna, mark, kracht, krachtCancelled],
  summary: {
    count: 4,
    done: 0,
    firstStartsAt: '2026-09-22T07:00:00.000Z',
    lastEndsAt: '2026-09-22T17:00:00.000Z',
  },
  next: { sessionId: 's-anna', state: 'upcoming', startsInMinutes: 25 },
  hasSessions: true,
};

const now = new Date('2026-09-22T06:35:00.000Z');

/** A catalog message with its one plural filled in for `count`. */
function plural(message: string, count: number): string {
  return message.replace(
    /\{count, plural, one \{([^}]*)\} other \{([^}]*)\}\}/,
    (_, one: string, other: string) => (count === 1 ? one : other).replace('#', String(count)),
  );
}

describe.each(locales)('F013 Mijn dag in %s', (locale) => {
  const copy = messages[locale].myDay;
  const formatting = locale === 'en' ? 'en-GB' : 'nl-NL';
  const view = (overrides: Partial<Day> = {}) =>
    render(locale, <MyDayView day={{ ...day, ...overrides }} now={now} />);
  /** The page as seen: without the spoken phrases of the rows (`aria-label`), which repeat their text. */
  const seen = (html: string) => html.replace(/ aria-label="[^"]*"/g, '');
  /** The links of the list, in order, as `href=text` of their visible text. */
  const rows = (html: string) =>
    [...html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g)].map(([, href, inner]) => [
      href,
      (inner ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    ]);

  it('F014: an Owner with a team has the toggle back to the Dashboard; nobody else has it', () => {
    const withToggle = render(
      locale,
      <MyDayView day={day} now={now} workspace={{ slug: 'johns-gym', name: "John's Gym" }} />,
    );

    expect(withToggle).toContain(`aria-label="${messages[locale].workspaceDashboard.scopeLabel}"`);
    expect(withToggle).toMatch(/aria-current="page"[^>]*>[^<]*<\/a>/);
    expect(withToggle).toContain('href="/w/johns-gym"');
    expect(view()).not.toContain(messages[locale].workspaceDashboard.scopeLabel);
  });

  it('AC1: the title, the date and the summary line', () => {
    const html = view();
    const date = new Intl.DateTimeFormat(formatting, {
      timeZone: 'Europe/Amsterdam',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date('2026-09-22T12:00:00Z'));

    expect(html).toContain(`<h1 class="text-xl font-semibold tracking-tight">${copy.title}</h1>`);
    expect(html).toContain(escapeHtml(date));
    expect(html).toContain(
      plural(copy.summary, 4).replace('{first}', '09:00').replace('{last}', '19:00'),
    );
  });

  it('AC1: Straks on top with the minutes, Anna once, then the others in time order, each with its type in words', () => {
    const html = seen(view());

    expect(html).toContain(copy.nextUpcoming.replace('{minutes}', '25'));
    expect(html.match(/Anna de Vries/g)).toHaveLength(1);
    expect(rows(html)).toEqual([
      ['/w/sarah-personal-training/sessions/s-anna', expect.stringContaining('Anna de Vries')],
      ['/w/johns-gym/sessions/s-mark', expect.stringContaining('Mark Jansen')],
      ['/w/johns-gym/sessions/s-kracht', expect.stringContaining('Kracht')],
      ['/w/johns-gym/sessions/s-kracht-cancelled', expect.stringContaining('Kracht')],
    ]);
    // Anna's row is in the Straks card, above the list.
    expect(html.indexOf(copy.nextUpcoming.replace('{minutes}', '25'))).toBeLessThan(
      html.indexOf('Anna de Vries'),
    );
    expect(html.indexOf('Anna de Vries')).toBeLessThan(html.indexOf('Mark Jansen'));
    expect(html).toContain(copy.typePrivate);
    expect(html).toContain(copy.typeGroup);
  });

  it('#1534: the kind is said by the API: a day with only private sessions of a workspace that also runs classes still names it', () => {
    const html = seen(
      view({
        workspaceCount: 1,
        workspaces: [{ ...gym, sessionTypes: ['private', 'group'] }],
        showsKindLabel: true,
        items: [mark],
        next: undefined,
        summary: { count: 1, done: 0, firstStartsAt: mark.startsAt, lastEndsAt: mark.endsAt },
      }),
    );

    expect(html).toContain(
      escapeHtml(
        copy.typeWithDetail
          .replace('{type}', copy.typePrivate)
          .replace('{detail}', "John's Gym Centrum"),
      ),
    );
  });

  it('#1534: a person whose workspaces run only private sessions never sees the kind on a row, as the API says', () => {
    const html = seen(
      view({
        workspaceCount: 1,
        workspaces: [{ ...own, sessionTypes: ['private'] }],
        showsKindLabel: false,
        items: [anna],
        next: undefined,
        summary: { count: 1, done: 0, firstStartsAt: anna.startsAt, lastEndsAt: anna.endsAt },
      }),
    );

    expect(html).toContain('Studio Zuid');
    expect(html).not.toContain(copy.typePrivate);
    expect(html).not.toContain(copy.typeGroup);
  });

  it('#1534: the phrase a screen reader gets names the kind either way', () => {
    const html = view({ showsKindLabel: false });

    expect(html).toMatch(new RegExp(`aria-label="[^"]*${copy.typePrivate}[^"]*"`));
    expect(html).toMatch(new RegExp(`aria-label="[^"]*${copy.typeGroup}[^"]*"`));
  });

  it('#1534: the web never works the kind out from the items: both kinds on the day, the API says no, no label', () => {
    const html = seen(view({ showsKindLabel: false }));

    expect(html).not.toContain(copy.typePrivate);
    expect(html).not.toContain(copy.typeGroup);
    // The class still shows its bookings, the private session its place.
    expect(html).toContain(copy.booked.replace('{booked}', '0').replace('{capacity}', '8'));
    expect(html).toContain('Studio Zuid');
  });

  it('AC1: a private session shows its location, a class its bookings, and a time range in Dutch time', () => {
    const html = view();

    expect(html).toContain('Studio Zuid');
    expect(html).toContain(escapeHtml("John's Gym Centrum"));
    expect(html).toContain(copy.booked.replace('{booked}', '0').replace('{capacity}', '8'));
    expect(html).toContain('09:00–10:00');
    expect(html).toContain('11:00–12:00');
    expect(html).toContain('15:00–16:00');
  });

  it('AC1: a cancelled session stays, struck through, with Geannuleerd; the others are not struck through', () => {
    const html = seen(view());
    const cancelled = rows(html).findIndex(([href]) => href?.endsWith('s-kracht-cancelled'));

    expect(cancelled).toBe(3);
    expect(html.match(new RegExp(escapeHtml(copy.cancelled), 'g'))).toHaveLength(1);
    expect(html.match(/line-through/g)).toHaveLength(1);
    expect(html.indexOf('line-through')).toBeGreaterThan(html.indexOf('s-kracht-cancelled'));
  });

  it('AC2: every row names its workspace with several workspaces, and none with one', () => {
    const several = seen(view());
    expect(several.match(/Sarah Personal Training/g)).toHaveLength(1);
    expect(several.match(/John&#x27;s Gym</g)).toHaveLength(3);

    const one = seen(
      view({
        workspaceCount: 1,
        items: [mark, kracht].map((item) => ({ ...item, workspace: gym })),
        next: undefined,
        summary: {
          count: 2,
          done: 0,
          firstStartsAt: mark.startsAt,
          lastEndsAt: kracht.endsAt,
        },
      }),
    );
    expect(one).not.toContain('John&#x27;s Gym</');
  });

  it('AC9: a row reads as one phrase with a pause between its parts', () => {
    const labels = (html: string) =>
      [...html.matchAll(/<a[^>]*aria-label="([^"]*)"/g)].map(([, label]) => label);
    const spoken = (start: string, end: string) =>
      copy.spokenTime.replace('{start}', start).replace('{end}', end);
    const join = (...parts: string[]) => parts.reduce((a, b) => `${a}, ${b}`);

    expect(labels(view()).map((label) => label?.replaceAll('&#x27;', "'"))).toEqual([
      join(spoken('09:00', '10:00'), 'Anna de Vries', copy.typePrivate, 'Studio Zuid', own.name),
      join(
        spoken('11:00', '12:00'),
        'Mark Jansen',
        copy.typePrivate,
        "John's Gym Centrum",
        gym.name,
      ),
      join(
        spoken('15:00', '16:00'),
        'Kracht',
        copy.typeGroup,
        copy.booked.replace('{booked}', '0').replace('{capacity}', '8'),
        gym.name,
      ),
      join(
        spoken('18:00', '19:00'),
        'Kracht',
        copy.typeGroup,
        copy.booked.replace('{booked}', '0').replace('{capacity}', '8'),
        gym.name,
        copy.cancelled,
      ),
    ]);
  });

  it('AC2: with one workspace the phrase leaves its name out', () => {
    const html = view({
      workspaceCount: 1,
      items: [{ ...mark, workspace: gym }],
      next: undefined,
      summary: { count: 1, done: 0, firstStartsAt: mark.startsAt, lastEndsAt: mark.endsAt },
    });

    expect(html).toMatch(/aria-label="[^"]*Mark Jansen[^"]*"/);
    expect(html.match(/aria-label="([^"]*)"/)?.[1]).toMatch(/Gym Centrum$/);
  });

  it('AC9: a row is one touch-sized link (44 px) in one column', () => {
    const html = view();

    expect(html.match(/<a /g)).toHaveLength(4);
    expect(html.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('while a session runs the card says Nu bezig', () => {
    const html = view({ next: { sessionId: 's-anna', state: 'in_progress', startsInMinutes: 0 } });

    expect(html).toContain(copy.nextInProgress);
    expect(html).not.toContain(copy.nextUpcoming.split('{minutes}')[0] as string);
  });

  it('past items are dimmed', () => {
    const later = render(
      locale,
      <MyDayView day={day} now={new Date('2026-09-22T09:30:00.000Z')} />,
    );

    expect(later.match(/text-muted-foreground/g)?.length).toBeGreaterThan(
      view().match(/text-muted-foreground/g)?.length ?? 0,
    );
  });

  it('AC5: the footer says how many sessions tomorrow and when the first one starts', () => {
    const html = view({
      tomorrow: { date: '2026-09-23', count: 3, firstStartsAt: '2026-09-23T05:00:00.000Z' },
    });

    expect(html).toContain(plural(copy.tomorrow, 3).replace('{time}', '07:00'));
  });

  it('From #522: the footer opens Mijn agenda on tomorrow, in the day view', () => {
    const html = view({
      tomorrow: { date: '2026-09-23', count: 3, firstStartsAt: '2026-09-23T05:00:00.000Z' },
    });

    expect(html).toMatch(
      /<a[^>]*href="\/me\/calendar\?view=day&amp;date=2026-09-23"[^>]*>[^<]*(07:00)/,
    );
  });

  it('AC5: no sessions today: the empty line, with the tomorrow line when there is one', () => {
    const empty = view({
      items: [],
      next: undefined,
      summary: { count: 0, done: 0 },
      tomorrow: { date: '2026-09-23', count: 1, firstStartsAt: '2026-09-23T07:00:00.000Z' },
      nextSessionDate: '2026-09-23',
    });

    expect(empty).toContain(copy.emptyToday);
    expect(empty).toContain(copy.summaryNone);
    expect(empty).toContain(plural(copy.tomorrow, 1).replace('{time}', '09:00'));
    // No session rows: the only link is the tomorrow line.
    expect(empty).not.toContain('/sessions/');
  });

  it('AC5: no sessions today and the next one on Thursday 1 October', () => {
    const html = view({
      items: [],
      next: undefined,
      summary: { count: 0, done: 0 },
      nextSessionDate: '2026-10-01',
    });
    const date = new Intl.DateTimeFormat(formatting, {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date('2026-10-01T12:00:00Z'));

    expect(html).toContain(escapeHtml(copy.emptyNext.replace('{date}', date)));
  });

  it('AC5: a trainer with no sessions at all', () => {
    const html = view({
      items: [],
      next: undefined,
      summary: { count: 0, done: 0 },
      hasSessions: false,
    });

    expect(html).toContain(escapeHtml(copy.emptyNever));
    expect(html).not.toContain(copy.emptyToday);
  });

  describe('F025 the nudge Aanwezigheid nog invullen', () => {
    const attendance = messages[locale].attendance;
    const buttons = (html: string) =>
      [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map(([, text]) => text);
    // Anna's session has ended with her still Geboekt: the API says so (`attendanceOpen`).
    const ended = {
      ...anna,
      attendanceOpen: true,
      clients: [{ clientId: 'c-anna', name: 'Anna de Vries' }],
    };
    const over = (items: Item[]) => view({ items });

    it('AC2: a session the API says waits for attendance shows the nudge with Aanwezig and Niet verschenen', () => {
      const html = over([ended, mark]);

      expect(html).toContain(escapeHtml(attendance.nudge));
      expect(buttons(html)).toEqual([attendance.status.attended, attendance.status.noShow]);
      expect(html).toContain(escapeHtml(attendance.nudgeFor.replace('{name}', 'Anna de Vries')));
    });

    it('AC2: no nudge while the session runs, and the buttons are never inside the row link', () => {
      expect(over([anna, mark])).not.toContain(escapeHtml(attendance.nudge));
      expect(buttons(over([anna, mark]))).toEqual([]);
      expect(over([ended])).not.toMatch(/<a[^>]*>(?:(?!<\/a>).)*<button/);
    });

    it('AC2: a class that has ended with open participants has the nudge as a link to the class, without buttons', () => {
      const html = over([
        {
          ...kracht,
          attendanceOpen: true,
          attendance: { attended: 0, noShow: 0, open: 3, cancelled: 0 },
        },
      ]);

      expect(html).toContain(escapeHtml(attendance.nudge));
      expect(buttons(html)).toEqual([]);
      expect(rows(html).map(([href]) => href)).toContain('/w/johns-gym/sessions/s-kracht');
    });
  });
});
