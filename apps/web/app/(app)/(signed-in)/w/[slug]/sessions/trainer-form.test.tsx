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
    const html = draw({ session: kracht, kind: 'substitute', initialTrainerId: 'mike' });

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
    const html = draw({ session: kracht, kind: 'substitute', initialTrainerId: 'mike' });

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
});
