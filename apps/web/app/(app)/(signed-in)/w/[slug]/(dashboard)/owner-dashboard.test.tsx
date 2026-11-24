import type { Schemas } from '@fivvi/contract';
import { formattingLocales, locales, messages, trainerWordForms } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { render } from '../../../../../../test/render';
import { OwnerDashboard } from './owner-dashboard';

// F014 (spec #458, ticket #532): the Owner's Dashboard as the day route answers it. Tuesday 22
// September 2026 in Pilot Gym (the seed of the spec's John's Gym), 08:30 Dutch time: Sven's
// private session at 07:00 is over, Kracht (Sven, 0/8) runs at 10:00, Noor's private session at
// 11:00 is still to come, the evening Kracht is cancelled; Boxing on Thursday 19:15 has no trainer.
type Item = Schemas['WorkspaceCalendarSession'];
const location = {
  id: 'l1',
  name: 'Pilot Gym',
  type: 'organization_location' as const,
  address: null,
  isDefault: true,
};
const mark: Item = {
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
};
const kracht: Item = {
  ...mark,
  id: 's-kracht',
  type: 'group',
  startsAt: '2026-09-22T08:00:00.000Z',
  endsAt: '2026-09-22T09:00:00.000Z',
  capacity: 8,
  booked: 0,
  className: 'Kracht',
  clientName: undefined,
};
const lisa: Item = {
  ...mark,
  id: 's-lisa',
  startsAt: '2026-09-22T09:00:00.000Z',
  endsAt: '2026-09-22T10:00:00.000Z',
  trainer: { id: 'm-noor', name: 'Noor' },
  clientName: 'Lisa Smit',
};
const krachtCancelled: Item = {
  ...kracht,
  id: 's-cancelled',
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
};
const privateWithoutTrainer: Item = {
  ...mark,
  id: 's-orphan',
  startsAt: '2026-09-25T07:00:00.000Z',
  endsAt: '2026-09-25T08:00:00.000Z',
  trainer: undefined,
  clientName: 'Anna de Vries',
};
const NOW = '2026-09-22T06:30:00.000Z';

const day = (overrides: Partial<Schemas['WorkspaceDay']> = {}): Schemas['WorkspaceDay'] => ({
  date: '2026-09-22',
  timeZone: 'Europe/Amsterdam',
  items: [mark, kracht, lisa, krachtCancelled],
  attention: [boxing],
  hasSessions: true,
  ...overrides,
});

describe.each(locales)('F014 the Owner’s Dashboard in %s', (locale) => {
  const copy = messages[locale].workspaceDashboard;
  const shared = messages[locale].myCalendar;
  const calendar = messages[locale].workspaceCalendar;
  const word = trainerWordForms('trainer', locale);
  const fill = (message: string) =>
    Object.entries(word).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, value),
      message,
    );
  const shortDay = (date: string) =>
    new Intl.DateTimeFormat(formattingLocales[locale], {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(`${date}T12:00:00Z`));
  const longDay = new Intl.DateTimeFormat(formattingLocales[locale], {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date('2026-09-22T12:00:00Z'));
  const draw = (
    overrides: Partial<Schemas['WorkspaceDay']> = {},
    props: { showToggle?: boolean } = {},
  ) =>
    render(
      locale,
      <OwnerDashboard
        day={day(overrides)}
        now={NOW}
        workspace="Pilot Gym"
        slug="pilot-gym"
        teamMemberId="m-paula"
        trainerWord={word}
        showToggle={props.showToggle ?? false}
      />,
    );
  /** The text of the HTML, with its tags taken out. */
  const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  it('AC10: names the day, counts the sessions done and the places of the classes', () => {
    const html = draw();

    expect(html).toContain(`<h1 class="text-xl font-semibold tracking-tight">${copy.title}</h1>`);
    expect(text(html)).toContain(copy.today.replace('{date}', longDay));
    // 08:30: Mark is done, Kracht and Lisa are not; the cancelled Kracht counts for nothing.
    expect(text(html)).toContain(`${copy.sessionsToday} 1/3 ${copy.sessionsDone}`);
    expect(text(html)).toContain(`${copy.groupSpots} 0/8 ${copy.groupBooked}`);
  });

  it('AC10: has one lane per trainer, each block a link that opens its session', () => {
    const html = draw();

    const lanes = html.match(/<li class="grid grid-cols-\[9rem_minmax\(0,1fr\)\]/g) ?? [];
    expect(lanes).toHaveLength(2);
    expect(text(html)).toContain(copy.lanesTitle.replace('{workspace}', 'Pilot Gym'));
    expect(text(html)).toContain(fill(copy.lanesNote));
    // Sven's and Noor's names head their lanes; the Owner trains nowhere in this day.
    expect(text(html)).toMatch(/Noor\s+<?.*Sven|Sven.*Noor/);
    for (const id of ['s-mark', 's-kracht', 's-lisa', 's-cancelled']) {
      expect(html).toContain(`href="/w/pilot-gym/sessions/${id}"`);
    }
    // Every block is one phrase for a screen reader, type first.
    const spoken = (type: string, name: string, start: string, end: string, trainer: string) =>
      `${shared.block.replace('{type}', type).replace('{name}', name)}, ${shared.spokenTime.replace('{start}', start).replace('{end}', end)}, ${trainer}`;
    expect(html).toContain(
      `aria-label="${spoken(shared.typePrivate, 'Mark Jansen', '07:00', '08:00', 'Sven')}"`,
    );
    expect(html).toContain(
      `aria-label="${spoken(shared.typeGroup, 'Kracht', '10:00', '11:00', 'Sven')}, ${calendar.spokenBooked.replace('{booked}', '0').replace('{capacity}', '8')}"`,
    );
  });

  it('AC10: a class block says its time and places through the catalog’s separator', () => {
    const html = draw({ items: [mark, kracht] });

    const detail = copy.blockDetail
      .replace('{time}', '10:00')
      .replace('{booked}', shared.blockBooked.replace('{booked}', '0').replace('{capacity}', '8'));
    expect(text(html)).toContain(detail);
  });

  it('AC10: the cancelled session stays in its lane, struck through, with its word', () => {
    const html = draw();

    expect(html).toMatch(/line-through[^>]*>Kracht<\/span><span class="truncate">/);
    expect(html).toContain(`>${shared.cancelled}</span>`);
  });

  it('AC10: Aandacht nodig lists the class date without a trainer with Toewijzen that opens it', () => {
    const html = draw();

    const row = fill(copy.attentionNoTrainer)
      .replace('{name}', 'Boxing')
      .replace('{date}', shortDay('2026-09-24'))
      .replace('{time}', '19:15');
    expect(text(html)).toContain(copy.attentionTitle);
    expect(text(html)).toContain(row);
    expect(html).toContain(`aria-label="${copy.assignLabel.replace('{item}', row)}"`);
    // F023 AC1: Toewijzen opens the trainer dialog (CO-02) on the date, not only the page.
    expect(html).toMatch(/href="\/w\/pilot-gym\/sessions\/s-boxing\?assign=1"[^>]*>/);
    expect(text(html)).not.toContain(copy.attentionNone);
  });

  it('Trainer nodig: a private session without a trainer reads "Privé · {client}" and opens the session', () => {
    const html = draw({ attention: [boxing, privateWithoutTrainer] });

    const row = fill(copy.attentionNoTrainer)
      .replace('{name}', `${shared.typePrivate} · Anna de Vries`)
      .replace('{date}', shortDay('2026-09-25'))
      .replace('{time}', '09:00');
    expect(text(html)).toContain(row);
    expect(html).toContain('href="/w/pilot-gym/sessions/s-orphan?assign=1"');
    // Both are there, in the API's time order.
    expect(text(html).indexOf('Boxing')).toBeLessThan(text(html).indexOf('Anna de Vries'));
  });

  it('Trainer nodig: once nobody is missing, the row is gone and the card says all is up to date', () => {
    const html = draw({ attention: [] });

    expect(text(html)).toContain(copy.attentionTitle);
    expect(text(html)).toContain(copy.attentionNone);
    expect(html).not.toContain(copy.assign);
  });

  it('AC10: Nog vandaag has Tijd, Sessie, Trainer and Bezetting and lists only what is still to come', () => {
    const html = draw();

    const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
    expect(text(table)).toContain(
      `${copy.columnTime} ${copy.columnSession} ${fill(calendar.columnTrainer)} ${copy.columnOccupancy}`,
    );
    expect(table).toContain('10:00–11:00');
    expect(table).toContain('11:00–12:00');
    // Mark's 07:00 session is over, the 18:00 one is cancelled.
    expect(table).not.toContain('07:00');
    expect(table).not.toContain('18:00');
    // A class shows its places, a private session its place; the type is said as both kinds are there.
    expect(text(table)).toContain('0/8');
    expect(text(table)).toContain('Pilot Gym');
    expect(text(table)).toContain(shared.typeGroup);
    expect(text(table)).toContain(shared.typePrivate);
    expect(text(html)).toContain(copy.stillToday);
    expect(html).toContain(`href="/w/pilot-gym/calendar"`);
    expect(text(html)).toContain(copy.toCalendar);
  });

  it('Nog vandaag: says so when nothing is left today', () => {
    const html = render(
      locale,
      <OwnerDashboard
        day={day()}
        now="2026-09-22T20:00:00.000Z"
        workspace="Pilot Gym"
        slug="pilot-gym"
        teamMemberId="m-paula"
        trainerWord={word}
        showToggle={false}
      />,
    );

    expect(text(html)).toContain(copy.noMoreToday);
    expect(html).not.toContain('<table');
  });

  it('shows the Owner as Jij in their lane and in the trainer column', () => {
    const own: Item = { ...mark, trainer: { id: 'm-paula', name: 'Paula' } };
    const html = draw({ items: [own, lisa] });

    expect(text(html)).toContain(calendar.you);
    expect(text(html)).not.toContain('Paula');
  });

  it('a day with private sessions only has no Groepsplekken tile and no type words', () => {
    const html = draw({ items: [mark, lisa], attention: [] });

    expect(text(html)).toContain(copy.sessionsToday);
    expect(text(html)).not.toContain(copy.groupSpots);
    expect(text(html)).not.toContain(shared.typePrivate);
    expect(text(html)).not.toContain(shared.typeGroup);
  });

  it('puts a session without a trainer in a lane of its own, named for what it lacks', () => {
    const html = draw({ items: [mark, { ...kracht, trainer: undefined }] });

    expect(text(html)).toContain(fill(calendar.noTrainer));
  });

  it('an empty day says so and offers no tiles, lanes or table, while Aandacht nodig stays', () => {
    const html = draw({ items: [] });

    expect(text(html)).toContain(copy.emptyDay.replace('{workspace}', 'Pilot Gym'));
    expect(text(html)).not.toContain(copy.sessionsToday);
    expect(text(html)).not.toContain(copy.lanesTitle.replace('{workspace}', 'Pilot Gym'));
    expect(html).not.toContain('<table');
    expect(text(html)).toContain(copy.attentionTitle);
    expect(text(html)).toContain(copy.toCalendar);
  });

  it('#1544: a new workspace, with no session ever, welcomes the Owner instead of the empty-day text', () => {
    const html = draw({ items: [], attention: [], hasSessions: false });

    expect(text(html)).toContain(copy.welcome);
    expect(text(html)).not.toContain(copy.emptyDay.replace('{workspace}', 'Pilot Gym'));
    expect(text(html)).not.toContain(copy.sessionsToday);
    // The rest of the page stays: Aandacht nodig (nothing open) and the way to the Agenda.
    expect(text(html)).toContain(copy.attentionTitle);
    expect(text(html)).toContain(copy.toCalendar);
  });

  it('#1544: a workspace with sessions but none today keeps the empty-day text, not the welcome', () => {
    const html = draw({ items: [], hasSessions: true });

    expect(text(html)).toContain(copy.emptyDay.replace('{workspace}', 'Pilot Gym'));
    expect(text(html)).not.toContain(copy.welcome);
  });

  it('#1544: the welcome never replaces a day that has rows', () => {
    const html = draw({ hasSessions: false });

    expect(text(html)).toContain(copy.sessionsToday);
    expect(text(html)).not.toContain(copy.welcome);
  });

  it('Mijn dag | workspace: the toggle opens the Owner’s own day, the workspace is the current one', () => {
    const html = draw({}, { showToggle: true });

    const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));
    expect(nav).toContain(`aria-label="${copy.scopeLabel}"`);
    expect(nav).toMatch(
      new RegExp(`href="/me/day"[^>]*>${messages[locale].workspaceNav.myDay}</a>`),
    );
    expect(nav).toMatch(/<a aria-current="page"[^>]*href="\/w\/pilot-gym">Pilot Gym<\/a>/);
    // Mijn dag comes first, the workspace second.
    expect(nav.indexOf('/me/day')).toBeLessThan(nav.indexOf('/w/pilot-gym'));
  });

  it('a solo PT’s Dashboard has no toggle', () => {
    expect(draw({}, { showToggle: false })).not.toContain('<nav');
  });

  it('words the people who teach as the workspace chose (F068)', () => {
    const coach = trainerWordForms('coach', locale);
    const html = render(
      locale,
      <OwnerDashboard
        day={day()}
        now={NOW}
        workspace="Pilot Gym"
        slug="pilot-gym"
        teamMemberId="m-paula"
        trainerWord={coach}
        showToggle={false}
      />,
    );

    expect(text(html)).toContain(
      `: ${locale === 'en' ? `no ${coach.word} yet` : `nog geen ${coach.word}`}`,
    );
    expect(text(html)).not.toMatch(/\b(?:trainer|trainers)\b/i);
  });
});
