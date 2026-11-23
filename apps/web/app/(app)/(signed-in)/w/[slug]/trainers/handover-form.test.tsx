import { locales, trainerWordForms } from '@fivvi/i18n';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { intlConfig } from '../../../../../../i18n/config';
import { render } from '../../../../../../test/render';
import { HandoverForm } from './handover-form';
import type { FutureSessions } from './remove-team-member-client';

// F023 (spec #459, ticket #540): the removal dialog's handover. Sarah has, in the next 2 weeks, 3
// private sessions and 4 Kracht dates, and after them 2 private sessions and 6 Kracht dates (AC9,
// "Later sessions"); Tom and John can take them over.
const future: FutureSessions = {
  teamMemberId: 'sarah',
  nextTwoWeeks: { privateSessions: 3, classDates: 4 },
  later: { privateSessions: 2, classDates: 6 },
  regularTrainerOfSeries: false,
  hasFutureSessions: true,
};
const trainers = [
  { id: 'tom', name: 'Tom' },
  { id: 'john', name: 'John' },
];

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replaceAll('&#x27;', "'")
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ');

describe.each(locales)('F023 the handover when removing a trainer in %s', (locale) => {
  const t = createTranslator({ ...intlConfig(locale), namespace: 'team.handover' });
  const form = createTranslator({ ...intlConfig(locale), namespace: 'sessions.form' });
  const word = trainerWordForms('trainer', locale);

  const draw = (props: Partial<Parameters<typeof HandoverForm>[0]> = {}) =>
    render(
      locale,
      <HandoverForm
        member={{ id: 'sarah', name: 'Sarah' }}
        future={future}
        trainers={trainers}
        trainerWord={word}
        message={null}
        pending={false}
        onSubmit={() => {}}
        onCancel={() => {}}
        {...props}
      />,
    );

  it('AC9: says what the next 2 weeks hold: 4 group classes and 3 private sessions', () => {
    expect(text(draw())).toContain(
      t('nextTwoWeeks', {
        parts: t('partsJoin', {
          first: t('classesCount', { count: 4 }),
          second: t('privateCount', { count: 3 }),
        }),
      }),
    );
  });

  it('each part is there only when it is: no private sessions in the next 2 weeks, only classes', () => {
    const html = text(
      draw({ future: { ...future, nextTwoWeeks: { privateSessions: 0, classDates: 4 } } }),
    );

    expect(html).toContain(t('nextTwoWeeks', { parts: t('classesCount', { count: 4 }) }));
    expect(html).not.toContain(t('privateLabel'));
    expect(html).toContain(t('classesLabel'));
  });

  it('AC9: asks where the private sessions and the classes go: a trainer of the workspace or Niemand', () => {
    const html = draw();

    expect(text(html)).toContain(t('privateLabel'));
    expect(text(html)).toContain(t('classesLabel'));
    expect(html.match(/<select/g)).toHaveLength(2);
    for (const name of ['Tom', 'John']) expect(html).toContain(`>${name}</option>`);
    expect(html).toContain(`>${t('nobody')}</option>`);
    // Nothing is cancelled unless the Owner says so: no choice is made for them.
    expect(text(html)).not.toContain(t('nobodyNote', { ...word }));
  });

  it('AC9a: with Niemand the note says classes get Trainer nodig and private sessions are cancelled with an email', () => {
    const html = text(draw({ initialPrivateTo: 'none' }));

    expect(html).toContain(t('nobodyNote', { ...word }));
  });

  it('AC10: with no other trainer only Niemand is there, with the note, and the person can still be removed', () => {
    const html = draw({ trainers: [] });

    expect(html).toContain(`>${t('nobody')}</option>`);
    expect(html).not.toContain(`>${form('trainerChoose', { ...word })}</option>`);
    expect(text(html)).toContain(t('nobodyNote', { ...word }));
    expect(html.match(/<button[^>]*type="submit"[^>]*>/)?.[0]).not.toContain(' disabled=""');
    expect(text(html)).toContain(t('submit'));
  });

  it('Later sessions: says how many sessions after the next 2 weeks get Trainer nodig and are assigned under Aandacht nodig', () => {
    expect(text(draw())).toContain(t('later', { ...word, count: 8 }));
  });

  it('no later sessions, no Daarna line', () => {
    const html = text(
      draw({ future: { ...future, later: { privateSessions: 0, classDates: 0 } } }),
    );

    expect(html).not.toContain(t('later', { ...word, count: 1 }).slice(0, 8));
  });

  it('a weekly class the person is the regular trainer of is named', () => {
    const html = text(draw({ future: { ...future, regularTrainerOfSeries: true } }));

    expect(html).toContain(t('seriesNote', { ...word, name: 'Sarah' }));
  });

  it('AC18: the notify box is on, and the button says Overdragen en verwijderen', () => {
    const html = draw();

    expect(text(html)).toContain(t('notify'));
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
    expect(text(html)).toContain(t('submit'));
  });

  it('only sessions after the next 2 weeks: no selects and no notify box, the person can be removed at once', () => {
    const html = draw({
      future: { ...future, nextTwoWeeks: { privateSessions: 0, classDates: 0 } },
    });

    expect(html).not.toContain('<select');
    expect(html).not.toContain('type="checkbox"');
    expect(text(html)).toContain(t('later', { ...word, count: 8 }));
  });
});
