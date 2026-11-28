import type { Schemas } from '@fivvi/contract';
import { locales, messages, trainerWordForms } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { OWNER, TRAINER } from '../../../../../../test/capabilities';
import { escapeHtml, render } from '../../../../../../test/render';
import { WorkspaceFrame } from '../workspace-frame';
import { ClassDateView } from './class-date-view';
import { ClassFormSections } from './class-form';
import { ClassLevelIcon, ClassLevelSelect } from './class-level';
import { ClassList } from './class-list';
import { ClassView } from './class-view';
import type { ClassInput } from './classes-client';
import { ClassesProvider } from './classes-provider';
import { CopyBookingLink } from './copy-booking-link';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => null,
}));

type GroupClass = Schemas['GroupClass'];
type Session = Schemas['Session'];

const kracht: GroupClass = {
  id: 'c1',
  nameNl: 'Kracht',
  nameEn: 'Strength',
  descriptionNl: 'Een stevige les voor het hele lichaam.',
  descriptionEn: null,
  capacity: 8,
  durationMinutes: 60,
  defaultTrainer: { id: 't1', name: 'Sarah' },
};
const mobility: GroupClass = {
  id: 'c2',
  nameNl: 'Mobility',
  nameEn: null,
  descriptionNl: null,
  descriptionEn: null,
  capacity: 1,
  durationMinutes: 45,
};

// Tuesday 6 October 2026, 18:00-19:00 in Amsterdam.
const date: Session = {
  id: 's1',
  type: 'group',
  status: 'scheduled',
  startsAt: '2026-10-06T16:00:00.000Z',
  endsAt: '2026-10-06T17:00:00.000Z',
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
  groupClass: { id: 'c1', nameNl: 'Kracht', nameEn: 'Strength' },
  participants: [],
};

const empty: ClassInput = {
  nameNl: '',
  nameEn: '',
  descriptionNl: '',
  descriptionEn: '',
  trainerId: '',
  level: '',
  capacity: '',
  durationMinutes: '',
};

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F021 the classes pages in %s', (locale) => {
  const copy = messages[locale];
  const word = trainerWordForms('trainer', locale);
  const formatting = locale === 'en' ? 'en-GB' : 'nl-NL';

  const list = (classes: GroupClass[]) =>
    render(
      locale,
      <ClassesProvider workspaceId="w1" slug="johns-gym" teamMemberId="m1" trainerWord={word}>
        <ClassList slug="johns-gym" classes={classes} trainerWord={word} />
      </ClassesProvider>,
    );

  describe('TW-03 Lessen', () => {
    it('AC1: a class shows in the viewer’s language, else Dutch (no English name: the Dutch one)', () => {
      const html = list([kracht, mobility]);

      expect(html).toContain(locale === 'en' ? 'Strength' : 'Kracht');
      expect(html).not.toContain(locale === 'en' ? '>Kracht<' : '>Strength<');
      expect(html).toContain('Mobility');
    });

    it('each row has the trainer or Trainer nodig, the spots, the duration and a link to the class', () => {
      const html = list([kracht, mobility]);

      expect(html).toContain('Sarah');
      expect(html).toContain(escapeHtml(copy.classes.trainerNeeded.replace('{Word}', word.Word)));
      expect(html).toContain(escapeHtml(locale === 'en' ? '8 spots' : '8 plekken'));
      expect(html).toContain(escapeHtml(locale === 'en' ? '1 spot' : '1 plek'));
      expect(html).toContain(escapeHtml(copy.classes.minutes.replace('{minutes}', '60')));
      expect(html).toContain('href="/w/johns-gym/classes/c1"');
    });

    it('has Nieuwe les, and the empty text without classes', () => {
      expect(list([kracht])).toContain(escapeHtml(copy.classes.new));
      const html = list([]);
      expect(html).toContain(escapeHtml(copy.classes.empty));
      expect(html).toContain(escapeHtml(copy.classes.new));
    });
  });

  describe('the class form', () => {
    const form = (errors = {}) =>
      render(
        locale,
        <ClassFormSections
          idPrefix="new-class"
          value={empty}
          onChange={() => {}}
          errors={errors}
          trainers={[{ id: 't1', name: 'Sarah' }]}
          trainerWord={word}
        />,
      );

    it('Design: two titled sections, with the four language-named labels', () => {
      const html = form();

      expect(html).toContain(escapeHtml(copy.classes.form.nameSection));
      expect(html).toContain(escapeHtml(copy.classes.form.classSection));
      expect(html).toContain(escapeHtml(copy.classes.form.nameNlLabel));
      expect(html).toContain(escapeHtml(copy.classes.form.nameEnLabel));
      expect(html).toContain(escapeHtml(copy.classes.form.descriptionNlLabel));
      expect(html).toContain(escapeHtml(copy.classes.form.descriptionEnLabel));
      expect(html).toContain(escapeHtml(copy.classes.form.capacityLabel));
      expect(html).toContain(escapeHtml(copy.classes.form.durationLabel));
      // The names are one line each and the descriptions are text areas.
      expect(html.match(/<textarea/g)).toHaveLength(2);
    });

    it('the labels name each language in both UI languages', () => {
      const html = form();

      expect(html).toContain(locale === 'en' ? 'Name (Dutch)' : 'Naam (Nederlands)');
      expect(html).toContain(
        locale === 'en' ? 'Name (English, optional)' : 'Naam (Engels, optioneel)',
      );
      expect(html).toContain(
        locale === 'en' ? 'Description (Dutch, optional)' : 'Omschrijving (Nederlands, optioneel)',
      );
      expect(html).toContain(
        locale === 'en' ? 'Description (English, optional)' : 'Omschrijving (Engels, optioneel)',
      );
    });

    it('the trainer field offers Trainer nodig and the trainers', () => {
      const html = form();

      expect(html).toContain(escapeHtml(copy.classes.trainerNeeded.replace('{Word}', word.Word)));
      expect(html).toContain('Sarah');
    });

    it('F067 AC1: Niveau sits in De les with Geen as the starting value and the four levels in the viewer’s language', () => {
      const html = form();
      const classSection = html.slice(html.indexOf(escapeHtml(copy.classes.form.classSection)));
      const select =
        classSection.match(/<select[^>]*name="level"[^>]*>[\s\S]*?<\/select>/)?.[0] ?? '';

      expect(classSection).toContain(`>${escapeHtml(copy.classLevel.field)}</label>`);
      expect(select).not.toBe('');
      expect(
        [...select.matchAll(/<option [^>]*value="([^"]*)"[^>]*>([^<]*)</g)].map((m) => [
          m[1],
          m[2],
        ]),
      ).toEqual([
        ['', escapeHtml(copy.classLevel.none)],
        ['all_levels', escapeHtml(copy.classLevel.allLevels)],
        ['beginner', escapeHtml(copy.classLevel.beginner)],
        ['intermediate', escapeHtml(copy.classLevel.intermediate)],
        ['advanced', escapeHtml(copy.classLevel.advanced)],
      ]);
      // The level comes after the trainer and before the capacity.
      expect(classSection.indexOf('name="trainerId"')).toBeLessThan(
        classSection.indexOf('name="level"'),
      );
      expect(classSection.indexOf('name="level"')).toBeLessThan(
        classSection.indexOf('name="capacity"'),
      );
    });

    it('F067 AC1: the select shows the level it holds', () => {
      const html = render(locale, <ClassLevelSelect id="x" value="advanced" onChange={() => {}} />);

      expect(html).toMatch(/<option [^>]*value="advanced"[^>]* selected=""/);
    });

    it('AC2: each refused field has its message under it', () => {
      const html = form({
        nameNl: 'nameRequired',
        capacity: 'capacityInvalid',
        durationMinutes: 'durationInvalid',
      });

      expect(html).toContain(escapeHtml(copy.classes.form.errors.nameRequired));
      expect(html).toContain(
        escapeHtml(
          copy.classes.form.errors.capacityInvalid.replace('{min}', '1').replace('{max}', '100'),
        ),
      );
      expect(html).toContain(
        escapeHtml(
          copy.classes.form.errors.durationInvalid
            .replace('{min}', '15')
            .replace('{max}', '240')
            .replace('{step}', '5'),
        ),
      );
      expect(html.match(/role="alert"/g)).toHaveLength(3);
    });
  });

  describe('the class page', () => {
    const view = (groupClass: GroupClass, canManage = true) =>
      render(
        locale,
        <ClassesProvider workspaceId="w1" slug="johns-gym" teamMemberId="m1" trainerWord={word}>
          <ClassView
            workspaceId="w1"
            teamMemberId="m1"
            slug="johns-gym"
            groupClass={groupClass}
            canManage={canManage}
            trainerWord={word}
          />
        </ClassesProvider>,
      );

    it('shows the name in the viewer’s language, the facts and Op een datum plannen', () => {
      const html = view(kracht);

      expect(html).toContain(`>${locale === 'en' ? 'Strength' : 'Kracht'}</h1>`);
      expect(html).toContain('Sarah');
      expect(html).toContain(escapeHtml(copy.classes.page.schedule));
      expect(html).toContain('href="/w/johns-gym/classes"');
    });

    it('AC1: the description falls back to Dutch for an English viewer without an English one', () => {
      expect(view(kracht)).toContain('Een stevige les voor het hele lichaam.');
      expect(view({ ...kracht, descriptionEn: 'A strong class.' })).toContain(
        locale === 'en' ? 'A strong class.' : 'Een stevige les voor het hele lichaam.',
      );
    });

    it('says when a class has no description', () => {
      expect(view(mobility)).toContain(escapeHtml(copy.classes.page.noDescription));
    });
  });

  describe('CO-01 the class on a date', () => {
    const view = (session: Session = date, canManage = true, canCopyLink = false) =>
      render(
        locale,
        <ClassDateView
          workspaceId="w1"
          slug="johns-gym"
          session={session}
          canManage={canManage}
          canCopyLink={canCopyLink}
          ownDate={false}
          trainerWord={word}
        />,
      );

    it('AC3: the title, the date and time, the location, the trainer and 0/8 geboekt with the free spots', () => {
      const html = view();

      const longDay = new Intl.DateTimeFormat(formatting, {
        timeZone: 'Europe/Amsterdam',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(date.startsAt));
      expect(html).toContain(`>${locale === 'en' ? 'Strength' : 'Kracht'}</h1>`);
      expect(html).toContain(
        escapeHtml(
          copy.classes.date.timeRange
            .replace('{date}', longDay)
            .replace('{start}', '18:00')
            .replace('{end}', '19:00'),
        ),
      );
      expect(html).toContain('John&#x27;s Gym');
      expect(html).toContain('Sarah');
      expect(html).toContain(
        locale === 'en' ? '0/8 booked · 8 spots free' : '0/8 geboekt · 8 plekken vrij',
      );
      expect(html).toContain(escapeHtml(copy.classes.date.noBookings));
    });

    it('a single free spot is the singular', () => {
      expect(view({ ...date, capacity: 1 })).toContain(
        locale === 'en' ? '0/1 booked · 1 spot free' : '0/1 geboekt · 1 plek vrij',
      );
    });

    it('AC5: a date without a trainer says Trainer nodig, with the workspace’s word', () => {
      const html = view({ ...date, trainer: undefined });

      expect(html).not.toContain('Sarah');
      expect(html).toContain(escapeHtml(copy.classes.trainerNeeded.replace('{Word}', word.Word)));
    });

    describe('F067 the level', () => {
      const levels = [
        ['all_levels', 'allLevels', 3],
        ['beginner', 'beginner', 1],
        ['intermediate', 'intermediate', 2],
        ['advanced', 'advanced', 3],
      ] as const;

      it.each(levels)('AC7: %s shows the icon and the word', (level, key) => {
        const html = view({ ...date, level });
        const word = copy.classLevel[key];

        expect(html).toContain(
          `aria-label="${escapeHtml(copy.classLevel.accessibleName.replace('{level}', word))}"`,
        );
        expect(html).toContain(`title="${escapeHtml(word)}"`);
        expect(html).toContain(`>${escapeHtml(word)}</span>`);
        expect(html).toContain(`>${escapeHtml(copy.classLevel.field)}</dt>`);
      });

      it('AC7: Geen shows nothing and leaves no empty line', () => {
        const html = view(date);

        expect(html).not.toContain('data-slot="level-icon"');
        expect(html).not.toContain(`>${escapeHtml(copy.classLevel.field)}</dt>`);
      });

      it('AC8: the Trainer sees the level on the page, with nothing to change it', () => {
        const html = view({ ...date, level: 'advanced' }, false);

        expect(html).toContain('data-slot="level-icon"');
        expect(html).not.toContain('<select');
        expect(html).not.toContain('<button');
      });
    });

    it('AC4: the Owner has Wijzigen', () => {
      expect(view()).toContain(escapeHtml(copy.classes.date.edit));
    });

    it('AC7: the assigned Trainer sees the page without actions', () => {
      const html = view(date, false);

      expect(html).toContain(`>${locale === 'en' ? 'Strength' : 'Kracht'}</h1>`);
      expect(html).not.toContain(escapeHtml(copy.classes.date.edit));
      expect(html).not.toContain('<button');
    });
  });

  describe('F022 the series on CO-01 and on the class page', () => {
    const seriesDate = (changedFields: ('time' | 'trainer' | 'capacity' | 'location')[] = []) =>
      ({
        ...date,
        series: {
          id: 'r1',
          weekday: 'TU' as const,
          localStartTime: '18:00',
          occurrenceDate: '2026-10-06',
          changedFields,
        },
      }) satisfies Session;
    const view = (session: Session, canManage: boolean) =>
      render(
        locale,
        <ClassDateView
          workspaceId="w1"
          slug="johns-gym"
          session={session}
          canManage={canManage}
          canCopyLink={false}
          ownDate={false}
          trainerWord={word}
        />,
      );
    const weekday = locale === 'en' ? 'Tuesday' : 'dinsdag';
    const seriesLine = escapeHtml(
      copy.classes.date.seriesLine
        .replace('{name}', locale === 'en' ? 'Strength' : 'Kracht')
        .replace('{weekday}', weekday)
        .replace('{time}', '18:00'),
    );

    it('AC1: a date of a series says which one: "Onderdeel van: Kracht, elke dinsdag 18:00"', () => {
      expect(view(seriesDate(), true)).toContain(seriesLine);
    });

    it('a date on its own has no series line', () => {
      expect(view(date, true)).not.toContain(
        escapeHtml(copy.classes.date.changedFromSeries.split('{')[0] ?? ''),
      );
      expect(view(date, true)).not.toContain(
        escapeHtml(copy.classes.date.seriesLine.split('{')[0] ?? ''),
      );
    });

    it('AC4: a date changed on its own says what differs, in the order time, trainer, capacity', () => {
      const html = view(seriesDate(['capacity', 'time']), true);

      expect(html).toContain(
        escapeHtml(
          copy.classes.date.changedFromSeries.replace(
            '{fields}',
            `${copy.classes.date.changedField.time}, ${copy.classes.date.changedField.capacity}`,
          ),
        ),
      );
    });

    it('AC4: a date that follows its series has no Aangepast line', () => {
      expect(view(seriesDate(), true)).not.toContain(
        escapeHtml(copy.classes.date.changedFromSeries.split('{')[0] ?? ''),
      );
    });

    it('AC8: the Trainer sees the series line, and no Wijzigen', () => {
      const html = view(seriesDate(['time']), false);

      expect(html).toContain(seriesLine);
      expect(html).not.toContain(escapeHtml(copy.classes.date.edit));
      expect(html).not.toContain('<button');
    });

    const classPage = (series: Schemas['ClassSeries'][], canManage = true) =>
      render(
        locale,
        <ClassesProvider workspaceId="w1" slug="johns-gym" teamMemberId="m1" trainerWord={word}>
          <ClassView
            workspaceId="w1"
            teamMemberId="m1"
            slug="johns-gym"
            groupClass={kracht}
            canManage={canManage}
            series={series}
            trainerWord={word}
          />
        </ClassesProvider>,
      );
    const weekly: Schemas['ClassSeries'] = {
      id: 'r1',
      groupClassId: 'c1',
      rrule: 'FREQ=WEEKLY;BYDAY=TU',
      weekday: 'TU',
      localStartTime: '18:00',
      durationMinutes: 60,
      timeZone: 'Europe/Amsterdam',
      trainer: { id: 't1', name: 'Sarah' },
      capacity: 8,
      startsOn: '2026-10-06',
      materializedUntil: '2026-12-22',
      version: 1,
    };

    it('AC1: Reeksen lists each series: "Elke dinsdag 18:00–19:00 · Sarah · 8 plekken", from its first date', () => {
      const html = classPage([weekly]);

      expect(html).toContain(escapeHtml(copy.classes.series.title));
      expect(html).toContain(
        escapeHtml(
          copy.classes.series.line
            .replace('{weekday}', weekday)
            .replace('{start}', '18:00')
            .replace('{end}', '19:00')
            .replace('{trainer}', 'Sarah')
            .replace('{spots}', locale === 'en' ? '8 spots' : '8 plekken'),
        ),
      );
      expect(html).toContain(
        escapeHtml(
          copy.classes.series.from.replace(
            '{date}',
            locale === 'en' ? '6 October 2026' : '6 oktober 2026',
          ),
        ),
      );
    });

    it('a series without a trainer says Trainer nodig', () => {
      const { trainer: _trainer, ...without } = weekly;

      expect(classPage([without])).toContain(
        escapeHtml(copy.classes.trainerNeeded.replace('{Word}', word.Word)),
      );
    });

    it('AC1 (#1523): each series has Wijzigen, named by its weekday and start', () => {
      const html = classPage([weekly]);

      expect(html).toContain(`>${escapeHtml(copy.classes.series.edit)}</button>`);
      expect(html).toContain(
        `aria-label="${escapeHtml(
          copy.classes.series.editLabel.replace('{weekday}', weekday).replace('{start}', '18:00'),
        )}"`,
      );
    });

    it('AC2 (#1523): a person without class.manage gets no Wijzigen', () => {
      const html = classPage([weekly], false);

      expect(html).toContain(escapeHtml(copy.classes.series.title));
      expect(html).not.toContain(escapeHtml(copy.classes.series.edit));
    });

    it('a class without a series has no Reeksen', () => {
      expect(classPage([])).not.toContain(escapeHtml(copy.classes.series.title));
    });
  });

  describe('F026 CO-03 Les annuleren and the cancelled date', () => {
    const view = (session: Session = date, canManage = true) =>
      render(
        locale,
        <ClassDateView
          workspaceId="w1"
          slug="johns-gym"
          session={session}
          canManage={canManage}
          canCopyLink={false}
          ownDate={false}
          trainerWord={word}
        />,
      );
    const cancelAction = escapeHtml(copy.classes.cancel.action);
    // John cancelled it on Monday 5 October at 09:15 (Amsterdam); Anna and Mark were booked.
    const cancelled: Session = {
      ...date,
      status: 'cancelled',
      cancellation: {
        cancelledAt: '2026-10-05T07:15:00.000Z',
        cancelledBy: { id: 'm1', name: 'John' },
        initiator: 'workspace',
        message: 'Sarah is ziek, sorry!',
      },
      participants: [
        { clientId: 'c1', name: 'Anna de Vries', attendanceStatus: 'cancelled' },
        { clientId: 'c2', name: 'Mark Jansen', attendanceStatus: 'cancelled' },
      ],
    };
    const day = new Intl.DateTimeFormat(formatting, {
      timeZone: 'Europe/Amsterdam',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date('2026-10-05T07:15:00.000Z'));

    it('AC5: the Owner has Les annuleren on a scheduled date; a Trainer does not', () => {
      expect(view()).toContain(cancelAction);
      expect(view(date, false)).not.toContain(cancelAction);
    });

    it('AC5: a cancelled date has no actions', () => {
      const html = view(cancelled);

      expect(html).not.toContain(cancelAction);
      expect(html).not.toContain(`>${escapeHtml(copy.classes.date.edit)}<`);
    });

    it('AC6: the cancelled date shows the banner and the cancelled participants, not the bookings', () => {
      const html = view(cancelled);

      expect(html).toContain(
        escapeHtml(
          copy.classes.date.cancelledBanner
            .replace('{date}', day)
            .replace('{time}', '09:15')
            .replace('{name}', 'John'),
        ),
      );
      expect(html).toContain(escapeHtml(copy.classes.date.cancelledSection));
      for (const name of ['Anna de Vries', 'Mark Jansen']) {
        expect(html).toContain(
          escapeHtml(
            copy.classes.date.cancelledParticipant
              .replace('{name}', name)
              .replace('{date}', day)
              .replace('{time}', '09:15'),
          ),
        );
      }
      expect(html).not.toContain(escapeHtml(copy.classes.date.noBookings));
      expect(html).not.toContain(escapeHtml(copy.classes.date.bookedLabel));
    });

    it('AC7: TW-03 says Gestopt vanaf 3 november for a series cancelled from that date', () => {
      const stopped = render(
        locale,
        <ClassesProvider workspaceId="w1" slug="johns-gym" teamMemberId="m1" trainerWord={word}>
          <ClassView
            workspaceId="w1"
            teamMemberId="m1"
            slug="johns-gym"
            groupClass={kracht}
            canManage
            series={[
              {
                id: 'r1',
                groupClassId: 'c1',
                rrule: 'FREQ=WEEKLY;BYDAY=TU',
                weekday: 'TU',
                localStartTime: '18:00',
                durationMinutes: 60,
                timeZone: 'Europe/Amsterdam',
                trainer: { id: 't1', name: 'Sarah' },
                capacity: 8,
                startsOn: '2026-10-06',
                endsOn: '2026-11-02',
                materializedUntil: '2026-11-02',
                version: 2,
              },
            ]}
            trainerWord={word}
          />
        </ClassesProvider>,
      );

      expect(stopped).toContain(
        escapeHtml(
          copy.classes.series.stopped.replace(
            '{date}',
            locale === 'en' ? '3 November' : '3 november',
          ),
        ),
      );
    });
  });

  describe('CO-01 Boekingslink kopiëren (F037)', () => {
    const view = (session: Session, canManage: boolean, canCopyLink: boolean) =>
      render(
        locale,
        <ClassDateView
          workspaceId="w1"
          slug="johns-gym"
          session={session}
          canManage={canManage}
          canCopyLink={canCopyLink}
          ownDate={false}
          trainerWord={word}
        />,
      );
    const copyLink = new RegExp(
      `<button[^>]*>${escapeHtml(copy.bookingLinks.copyBooking)}</button>`,
    );

    it('AC8: the Owner has Boekingslink kopiëren beside Wijzigen', () => {
      const html = view(date, true, true);

      expect(html).toMatch(copyLink);
      expect(html).toContain(escapeHtml(copy.classes.date.edit));
    });

    it('AC9: the assigned Trainer, who sees no other actions, sees this one', () => {
      const html = view(date, false, true);

      expect(html).toMatch(copyLink);
      expect(html).not.toContain(escapeHtml(copy.classes.date.edit));
      expect(html.match(/<button/g)).toHaveLength(1);
    });

    it('a date that offers no link (cancelled, past) has no Boekingslink kopiëren', () => {
      expect(view(date, true, false)).not.toContain(escapeHtml(copy.bookingLinks.copyBooking));
    });
  });

  describe('WC-05 Boekingslink kopiëren as an icon button (F037)', () => {
    const html = render(locale, <CopyBookingLink workspaceId="w1" sessionId="s1" variant="icon" />);
    const name = escapeHtml(copy.bookingLinks.copyBooking);

    it('AC8: shows a share icon only, named and given its tooltip by Boekingslink kopiëren', () => {
      expect(html).toMatch(new RegExp(`<button[^>]*aria-label="${name}"[^>]*>`));
      expect(html).toMatch(new RegExp(`<button[^>]*title="${name}"[^>]*>`));
      expect(html).toMatch(/<button[^>]*><svg[^>]*aria-hidden="true"/);
      expect(html).not.toContain(`>${name}<`);
    });
  });

  describe('F023 CO-01 Trainer toewijzen and Trainer vervangen', () => {
    const series: NonNullable<Session['series']> = {
      id: 'r1',
      weekday: 'TU',
      localStartTime: '18:00',
      occurrenceDate: '2026-10-06',
      changedFields: [],
    };
    const view = (session: Session, assign = true) =>
      render(
        locale,
        <ClassDateView
          workspaceId="w1"
          slug="johns-gym"
          session={session}
          canManage
          canCopyLink={false}
          ownDate={false}
          trainerWord={word}
          {...(assign
            ? { assign: { workspaceName: "John's Gym", teamMemberId: 'm-john', startOpen: false } }
            : {})}
        />,
      );
    const title = (key: 'titleAssign' | 'titleSubstitute') =>
      escapeHtml(
        copy.sessions.trainerDialog[key]
          .replace('{aWord}', word.aWord)
          .replace('{word}', word.word),
      );

    it('AC1: a date without a trainer has Trainer toewijzen', () => {
      const html = view({ ...date, trainer: undefined });

      expect(html).toContain(title('titleAssign'));
      expect(html).not.toContain(title('titleSubstitute'));
    });

    it('AC2: a date of a series that has a trainer has Trainer vervangen', () => {
      const html = view({ ...date, series });

      expect(html).toContain(title('titleSubstitute'));
      expect(html).not.toContain(title('titleAssign'));
    });

    it('F024 AC1: a one-off date that has a trainer has Trainer vervangen too (Alleen deze les)', () => {
      const html = view(date);

      expect(html).toContain(title('titleSubstitute'));
      expect(html).not.toContain(title('titleAssign'));
    });

    it('F024 AC3: a substituted date says "Mike (vervangt Sarah)" as its trainer, and a regular one just the name', () => {
      const substitute = copy.classes.date.substitute
        .replace('{substitute}', 'Mike')
        .replace('{original}', 'Sarah');
      const html = view({
        ...date,
        series,
        trainer: { id: 'm-mike', name: 'Mike' },
        substituteFor: { id: 'm-sarah', trainerProfileId: 'p-sarah', name: 'Sarah' },
      });

      expect(html).toContain(escapeHtml(substitute));
      expect(view({ ...date, series })).not.toContain(escapeHtml(substitute));
    });

    it('a cancelled date has neither', () => {
      const html = view({ ...date, status: 'cancelled', trainer: undefined });

      expect(html).not.toContain(title('titleAssign'));
    });

    it('AC12: a person who may not assign (a Trainer) sees no assignment action', () => {
      const html = view({ ...date, trainer: undefined }, false);

      expect(html).not.toContain(title('titleAssign'));
      expect(html).not.toContain(title('titleSubstitute'));
    });
  });

  describe('the frame', () => {
    const frame = (capabilities: typeof OWNER, groupClasses = false) =>
      render(
        locale,
        <WorkspaceFrame
          trainerWord={trainerWordForms('trainer', locale)}
          name="John's Gym"
          slug="johns-gym"
          teamRole="owner"
          workspaces={[]}
          canCreateWorkspace={false}
          capabilities={capabilities}
          personName="John"
          groupClasses={
            groupClasses ? { workspaceId: 'w1', teamMemberId: 'm1', trainerWord: word } : undefined
          }
        >
          <hr />
        </WorkspaceFrame>,
      );

    it('AC7: Lessen is in the navigation of a person who manages classes, and not in a Trainer’s', () => {
      expect(frame([...OWNER, 'class.manage', 'class.read'], true)).toContain(
        `<span class="truncate">${escapeHtml(copy.workspaceNav.classes)}</span>`,
      );
      expect(frame([...TRAINER, 'class.read'])).not.toContain(
        `<span class="truncate">${escapeHtml(copy.workspaceNav.classes)}</span>`,
      );
    });

    it('+ Nieuw is there for a person who may add a group class', () => {
      expect(frame(['clients.view', 'class.manage'], true)).toContain(
        escapeHtml(copy.workspaceNav.new),
      );
    });
  });

  describe('F067 the level icon', () => {
    const icon = (level: Parameters<typeof ClassLevelIcon>[0]['level'], compact = false) =>
      render(locale, <ClassLevelIcon level={level} compact={compact} />);

    it('AC13: the accessible name has the word in the viewer’s language: "Niveau: Gevorderd" / "Level: Advanced"', () => {
      expect(icon('advanced')).toContain(
        `aria-label="${escapeHtml(locale === 'en' ? 'Level: Advanced' : 'Niveau: Gevorderd')}"`,
      );
      expect(icon('intermediate', true)).toContain(
        `aria-label="${escapeHtml(locale === 'en' ? 'Level: Intermediate' : 'Niveau: Gemiddeld')}"`,
      );
    });

    it('draws nothing for Geen, and nothing in a list for Alle niveaus', () => {
      expect(icon(undefined)).toBe('');
      expect(icon('all_levels', true)).toBe('');
      expect(icon('all_levels')).not.toBe('');
    });
  });
});
