import type { Schemas } from '@fivvi/contract';
import { locales, messages, trainerWordForms } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { OWNER, TRAINER } from '../../../../../../test/capabilities';
import { escapeHtml, render } from '../../../../../../test/render';
import { WorkspaceFrame } from '../workspace-frame';
import { ClassDateView } from './class-date-view';
import { ClassFormSections } from './class-form';
import { ClassList } from './class-list';
import { ClassView } from './class-view';
import type { ClassInput } from './classes-client';
import { ClassesProvider } from './classes-provider';

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

  describe('the frame', () => {
    const frame = (capabilities: typeof OWNER, groupClasses = false) =>
      render(
        locale,
        <WorkspaceFrame
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
});
