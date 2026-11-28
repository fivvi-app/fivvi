import type { Schemas } from '@fivvi/contract';
import { locales, trainerWordForms } from '@fivvi/i18n';
import { createTranslator } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { intlConfig } from '../../../../../../i18n/config';
import { render } from '../../../../../../test/render';
import type { TrainerCandidates } from './trainer-assignment-client';
import { TrainerForm } from './trainer-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => null,
}));

// F023 (spec #459, tickets #539, #541): CO-02 *Trainer toewijzen* / *Trainer vervangen* and
// *Trainer wijzigen*, the body of the dialog as the candidates route answers it. John's Gym:
// Mike has a private session with Anna on Tuesday 6 October at 18:30 (AC3), Tom is free.
const location = {
  id: 'l1',
  name: "John's Gym",
  type: 'organization_location' as const,
  address: null,
  isDefault: true,
};
const kracht: Schemas['Session'] = {
  id: 's-kracht',
  type: 'group',
  status: 'scheduled',
  startsAt: '2026-10-06T16:00:00.000Z',
  endsAt: '2026-10-06T17:00:00.000Z',
  timeZone: 'Europe/Amsterdam',
  capacity: 12,
  version: 3,
  location,
  trainer: { id: 'sarah', name: 'Sarah' },
  groupClass: { id: 'g1', nameNl: 'Kracht', nameEn: 'Strength' },
  series: {
    id: 'series1',
    weekday: 'TU',
    localStartTime: '18:00',
    occurrenceDate: '2026-10-06',
    changedFields: [],
  },
  participants: [],
};
const boxing: Schemas['Session'] = {
  ...kracht,
  id: 's-boxing',
  startsAt: '2026-09-24T17:15:00.000Z',
  endsAt: '2026-09-24T18:15:00.000Z',
  groupClass: { id: 'g2', nameNl: 'Boxing', nameEn: 'Boxing' },
  trainer: undefined,
  series: undefined,
};
const markSession: Schemas['Session'] = {
  ...kracht,
  id: 's-mark',
  type: 'private',
  groupClass: undefined,
  series: undefined,
  capacity: 1,
  participants: [{ clientId: 'c-mark', name: 'Mark Jansen', attendanceStatus: 'booked' }],
};
const candidates = (overrides: Partial<TrainerCandidates> = {}): TrainerCandidates => ({
  sessionId: 's-kracht',
  trainers: [
    {
      id: 'mike',
      name: 'Mike',
      conflicts: [
        {
          sessionId: 's-anna',
          type: 'private',
          startsAt: '2026-10-06T16:30:00.000Z',
          endsAt: '2026-10-06T17:30:00.000Z',
          displayName: 'Anna de Vries',
          displayNameEn: null,
        },
      ],
      laterConflictingDates: 2,
    },
    { id: 'tom', name: 'Tom', conflicts: [], laterConflictingDates: 0 },
  ],
  participantsToNotify: { forThisDate: 0, forFollowingDates: 2 },
  ...overrides,
});

/** The visible text of the markup, whitespace folded, entities decoded the way the catalogs write them. */
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replaceAll('&#x27;', "'")
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ');

describe.each(locales)('F023 the trainer dialog in %s', (locale) => {
  const t = createTranslator({ ...intlConfig(locale), namespace: 'sessions.trainerDialog' });
  const form = createTranslator({ ...intlConfig(locale), namespace: 'sessions.form' });
  const word = trainerWordForms('trainer', locale);
  const className = (session: Schemas['Session']) =>
    locale === 'en' ? session.groupClass?.nameEn : session.groupClass?.nameNl;

  const draw = (props: Partial<Parameters<typeof TrainerForm>[0]> = {}) =>
    text(
      render(
        locale,
        <TrainerForm
          session={boxing}
          kind="assign"
          candidates={candidates()}
          trainerWord={word}
          workspaceName="John's Gym"
          slug="johns-gym"
          message={null}
          pending={false}
          onSubmit={() => {}}
          onCancel={() => {}}
          {...props}
        />,
      ),
    );

  it('AC1: a class date without a trainer asks who teaches it and lists the trainers by name', () => {
    const html = draw();

    expect(html).toContain(t('whoAssign'));
    expect(html).not.toContain(t('currently', { name: '' }).trim());
    expect(html).toContain('Mike');
    expect(html).toContain('Tom');
    expect(html).toContain(t('bookingsStay'));
    expect(html).toContain(t('submitAssign'));
  });

  it('AC2: a date of a series with a trainer shows who it is now and asks who takes over', () => {
    const html = draw({ session: kracht, kind: 'substitute' });

    expect(html).toContain(t('currently', { name: 'Sarah' }));
    expect(html).toContain(t('whoSubstitute'));
    expect(html).toContain(t('submitSubstitute'));
  });

  it('AC2: with Deze en alle volgende lessen the dialog says who becomes the regular trainer from which date', () => {
    const html = draw({
      session: kracht,
      kind: 'substitute',
      initialTrainerId: 'mike',
      initialScope: 'following',
    });

    expect(html).toContain(
      t('followingLine', {
        ...word,
        trainer: 'Mike',
        date: locale === 'en' ? '6 October' : '6 oktober',
        class: className(kracht) ?? '',
      }),
    );
  });

  it('AC3: Mike’s row says he already has a private session at 18:30; Tom’s row has no hint', () => {
    const html = draw({ session: kracht, kind: 'substitute' });

    expect(html).toContain(t('conflictPrivate', { time: '18:30' }));
    expect(html.match(/18:30/g)).toHaveLength(1);
  });

  it('AC3: with Deze en alle volgende lessen the dialog also counts the later dates that conflict', () => {
    const html = draw({
      session: kracht,
      kind: 'substitute',
      initialTrainerId: 'mike',
      initialScope: 'following',
    });

    expect(html).toContain(t('laterConflicts', { trainer: 'Mike', count: 2 }));
  });

  it('AC4: a trainer the API lists with no conflicts has no hint, whatever other workspaces hold', () => {
    const html = draw({
      candidates: candidates({
        trainers: [{ id: 'sarah', name: 'Sarah', conflicts: [], laterConflictingDates: 0 }],
      }),
    });

    expect(html).toContain('Sarah');
    expect(html).not.toMatch(/\(\d{2}:\d{2}\)/);
  });

  it('AC17: the notify box counts the participants of every affected date and is on', () => {
    const html = render(
      locale,
      <TrainerForm
        session={kracht}
        kind="substitute"
        candidates={candidates()}
        trainerWord={word}
        workspaceName="John's Gym"
        slug="johns-gym"
        initialTrainerId="mike"
        initialScope="following"
        message={null}
        pending={false}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(text(html)).toContain(t('notifyClass', { count: 2 }));
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
  });

  it('AC17: a date nobody booked has no notify box', () => {
    const html = render(
      locale,
      <TrainerForm
        session={boxing}
        kind="assign"
        candidates={candidates({ participantsToNotify: { forThisDate: 0, forFollowingDates: 0 } })}
        trainerWord={word}
        workspaceName="John's Gym"
        slug="johns-gym"
        message={null}
        pending={false}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(html).not.toContain('type="checkbox"');
  });

  it('a date without a trainer in a series offers Alleen deze les and Deze en alle volgende lessen', () => {
    const html = draw({ session: { ...kracht, trainer: undefined } });

    expect(html).toContain(t('scopeLabel'));
    expect(html).toContain(t('scopeThis'));
    expect(html).toContain(t('scopeFollowing'));
  });

  it('a one-off date has no Voor', () => {
    expect(draw()).not.toContain(t('scopeFollowing'));
  });

  it('no other trainers: says so with the workspace’s word and offers to invite one', () => {
    const html = render(
      locale,
      <TrainerForm
        session={boxing}
        kind="assign"
        candidates={candidates({ trainers: [] })}
        trainerWord={word}
        workspaceName="John's Gym"
        slug="johns-gym"
        message={null}
        pending={false}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(text(html)).toContain(t('noOthers', { ...word, workspace: "John's Gym" }));
    expect(html).toContain('href="/w/johns-gym/trainers"');
    expect(text(html)).toContain(t('inviteTrainer', { ...word }));
  });

  it('AC8: Trainer wijzigen is a select of the trainers with the same hint, and the client’s notify box with the address and language', () => {
    const html = render(
      locale,
      <TrainerForm
        session={markSession}
        kind="change"
        candidates={candidates({ participantsToNotify: { forThisDate: 1, forFollowingDates: 0 } })}
        client={{ name: 'Mark Jansen', email: 'mark@example.com', emailLocale: 'en' }}
        trainerWord={word}
        workspaceName="John's Gym"
        slug="johns-gym"
        message={null}
        pending={false}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(html).toContain('<select');
    expect(text(html)).toContain(t('conflictPrivate', { time: '18:30' }));
    expect(text(html)).toContain(t('notifyClient', { client: 'Mark Jansen' }));
    expect(text(html)).toContain(
      t('notifyClientNote', { email: 'mark@example.com', language: form('languageEn') }),
    );
    expect(text(html)).toContain(t('submitChange'));
  });

  it('AC8: a session that has started (nobody to tell) has no notify box', () => {
    const html = render(
      locale,
      <TrainerForm
        session={markSession}
        kind="change"
        candidates={candidates({ participantsToNotify: { forThisDate: 0, forFollowingDates: 0 } })}
        client={{ name: 'Mark Jansen', email: 'mark@example.com', emailLocale: 'nl-NL' }}
        trainerWord={word}
        workspaceName="John's Gym"
        slug="johns-gym"
        message={null}
        pending={false}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(html).not.toContain('type="checkbox"');
  });

  // F024 (spec #461, tickets #553, #1636): CO-02 on a date that has a trainer is a substitution
  // with Alleen deze les first, the substitute's own email box and the participants' box.
  describe('F024 substituting', () => {
    const before = new Date('2026-10-01T10:00:00.000Z');
    const after = new Date('2026-10-06T16:30:00.000Z');
    const two = candidates({ participantsToNotify: { forThisDate: 2, forFollowingDates: 5 } });
    /** The markup (not only its text), to see the boxes and what is checked. */
    const markup = (props: Partial<Parameters<typeof TrainerForm>[0]> = {}) =>
      render(
        locale,
        <TrainerForm
          session={kracht}
          kind="substitute"
          candidates={two}
          trainerWord={word}
          workspaceName="John's Gym"
          slug="johns-gym"
          now={before}
          message={null}
          pending={false}
          onSubmit={() => {}}
          onCancel={() => {}}
          {...props}
        />,
      );
    const substitution = markup;
    const checkboxes = (html: string) => html.match(/<input[^>]*type="checkbox"/g) ?? [];

    it('AC1: Alleen deze les is the default and the title names the dialog, Deze en alle volgende lessen is the other choice', () => {
      const html = markup();

      expect(html).toMatch(/<input[^>]*checked=""[^>]*value="this"/);
      expect(html).not.toMatch(/<input[^>]*checked=""[^>]*value="following"/);
      expect(text(html)).toContain(t('scopeFollowing'));
      expect(text(html)).toContain(t('bookingsStay'));
      expect(text(html)).not.toContain(t('laterConflicts', { trainer: 'Mike', count: 2 }));
    });

    it('AC1: once a substitute is picked, the box to email them comes first, with their name, and is on', () => {
      const html = substitution({ initialTrainerId: 'mike' });

      expect(text(html)).toContain(t('notifySubstitute', { trainer: 'Mike' }));
      expect(text(html).indexOf(t('notifySubstitute', { trainer: 'Mike' }))).toBeLessThan(
        text(html).indexOf(t('notifyClass', { count: 2 })),
      );
      expect(checkboxes(html)).toHaveLength(2);
      expect(html.match(/<input[^>]*type="checkbox"[^>]*checked/g)).toHaveLength(2);
    });

    it('AC16: the participants’ box counts the people booked on that date and is on by default', () => {
      const html = substitution();

      expect(text(html)).toContain(t('notifyClass', { count: 2 }));
      expect(text(html)).not.toContain(t('notifyClass', { count: 5 }));
      expect(checkboxes(html)).toHaveLength(1);
    });

    it('AC16: for a date that has started neither box shows', () => {
      const html = substitution({
        initialTrainerId: 'mike',
        now: after,
        candidates: candidates({ participantsToNotify: { forThisDate: 0, forFollowingDates: 0 } }),
      });

      expect(checkboxes(html)).toHaveLength(0);
    });

    it('AC8: a date that has started shows no box even if the API still counted participants', () => {
      const html = substitution({ initialTrainerId: 'mike', now: after });

      expect(checkboxes(html)).toHaveLength(0);
      expect(text(html)).not.toContain(t('notifySubstitute', { trainer: 'Mike' }));
      expect(text(html)).not.toContain(t('notifyClass', { count: 2 }));
    });

    it('AC16: a date nobody booked has only the box to email the substitute', () => {
      const html = substitution({
        initialTrainerId: 'mike',
        candidates: candidates({ participantsToNotify: { forThisDate: 0, forFollowingDates: 0 } }),
      });

      expect(checkboxes(html)).toHaveLength(1);
      expect(text(html)).toContain(t('notifySubstitute', { trainer: 'Mike' }));
    });

    it('AC6: with Deze en alle volgende lessen the substitute’s box is gone and the usual notify box counts every date', () => {
      const html = substitution({ initialTrainerId: 'mike', initialScope: 'following' });

      expect(text(html)).not.toContain(t('notifySubstitute', { trainer: 'Mike' }));
      expect(text(html)).toContain(t('notifyClass', { count: 5 }));
      expect(checkboxes(html)).toHaveLength(1);
    });

    describe('on a substituted date', () => {
      const substituted: Schemas['Session'] = {
        ...kracht,
        trainer: { id: 'mike', name: 'Mike' },
        substituteFor: { id: 'sarah', trainerProfileId: 'p-sarah', name: 'Sarah' },
      };
      const others = candidates({
        trainers: [
          { id: 'lisa', name: 'Lisa', conflicts: [], laterConflictingDates: 0 },
          { id: 'sarah', name: 'Sarah', conflicts: [], laterConflictingDates: 0 },
        ],
        participantsToNotify: { forThisDate: 2, forFollowingDates: 5 },
      });

      it('AC5: lists the regular trainer first, marked (vaste trainer), and the others after', () => {
        const html = text(
          markup({ session: substituted, kind: 'substitute', candidates: others, now: before }),
        );

        expect(html).toContain(t('regularTrainer', { ...word, name: 'Sarah' }));
        expect(html.indexOf('Sarah')).toBeLessThan(html.indexOf('Lisa'));
        expect(html).toContain(t('currently', { name: 'Mike' }));
      });

      it('AC5, AC17: choosing the regular trainer ends it: only the participants’ box shows, on by default', () => {
        const html = markup({
          session: substituted,
          kind: 'substitute',
          candidates: others,
          initialTrainerId: 'sarah',
          now: before,
        });

        expect(text(html)).toContain(t('notifyClass', { count: 2 }));
        expect(text(html)).not.toContain(t('notifySubstitute', { trainer: 'Sarah' }));
        expect(checkboxes(html)).toHaveLength(1);
        expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
      });

      it('AC5: choosing a third trainer is a substitution again: both boxes show', () => {
        const html = markup({
          session: substituted,
          kind: 'substitute',
          candidates: others,
          initialTrainerId: 'lisa',
          now: before,
        });

        expect(text(html)).toContain(t('notifySubstitute', { trainer: 'Lisa' }));
        expect(checkboxes(html)).toHaveLength(2);
      });
    });
  });
});
