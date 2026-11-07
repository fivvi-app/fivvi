import { type Locale, locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { SCENES, SHOT_IDS, shots } from '../home/screens';
import {
  type AudiencePageId,
  audiencePageIds,
  audiencePages,
  forKind,
  kinds,
} from './audience-data';

const clock = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The screens of a moment in every kind of studio there is. */
const screensOf = (page: AudiencePageId) =>
  audiencePages[page].moments.flatMap((moment) => kinds.map((kind) => forKind(moment.shot, kind)));

// F064 AC2: what each audience page shows is the owner's design (`DECISIONS.md` §9, the website
// design's `content.js`): the same moments, in the same order, with the screens it chose.
describe('F064 the four audience pages’ data', () => {
  it('has the four pages, in the order of the header', () => {
    expect(audiencePageIds).toEqual(['gyms', 'studios', 'personalTrainers', 'clients']);
  });

  it('tells each page’s working day in the designed order, with the designed screens', () => {
    const day = (page: AudiencePageId) =>
      audiencePages[page].moments.map(({ id, time, shot }) => [id, time, forKind(shot, 'pilates')]);

    expect(day('gyms')).toEqual([
      ['crew', '07:00', 'pro-today-gym'],
      ['attention', '09:00', 'web-dashboard'],
      ['team', '11:00', 'web-trainers'],
      ['substitute', '14:00', 'web-class'],
      ['offers', '16:00', 'web-offers'],
      ['payments', '18:00', 'web-payments'],
      ['renewal', '21:00', 'web-client'],
    ]);
    expect(day('studios')).toEqual([
      ['waitlist', '06:45', 'cw-waitlist-pilates'],
      ['credits', '09:00', 'app-credit'],
      ['substitute', '10:30', 'web-class-pilates'],
      ['level', '12:00', 'pro-class-pilates'],
      ['word', '15:00', 'pro-today-pilates'],
      ['poster', '19:00', 'web-join-pilates'],
    ]);
    expect(day('personalTrainers')).toEqual([
      ['today', '07:00', 'pro-today-solo'],
      ['last', '07:25', 'pro-client'],
      ['log', '07:30', 'pro-log'],
      ['credits', '08:30', 'pro-session'],
      ['duo', '09:15', 'pro-duo'],
      ['share', '09:20', 'pro-share'],
    ]);
    expect(day('clients')).toEqual([
      ['book', '08:10', 'app-book'],
      ['confirm', '08:11', 'app-confirm'],
      ['waitlist', '12:30', 'cw-waitlist'],
      ['week', '18:30', 'app-home'],
      ['self', '20:00', 'app-self'],
      ['studios', '21:00', 'app-studios'],
      ['renew', '22:00', 'app-renew'],
    ]);
  });

  it('gives yoga its own screens, and the A4 poster of each studio, not a stand-in', () => {
    const studio = audiencePages.studios;
    const yoga = studio.moments.map(({ shot }) => forKind(shot, 'yoga'));

    expect(yoga).toEqual([
      'cw-waitlist-yoga',
      'app-credit',
      'web-class-yoga',
      'pro-class-yoga',
      'pro-today-yoga',
      'web-join-yoga',
    ]);
    expect(studio.scene).toEqual({ pilates: 'pilates', yoga: 'yoga' });
    expect(forKind(studio.stage, 'yoga')).toEqual({
      kind: 'mix',
      web: 'web-class-yoga',
      phone: 'pro-today-yoga',
    });
  });

  it('uses only screens and miniatures that exist', () => {
    for (const page of audiencePageIds) {
      for (const shot of screensOf(page)) expect(SHOT_IDS).toContain(shot);
      for (const kind of kinds) {
        const stage = forKind(audiencePages[page].stage, kind);
        const used = stage.kind === 'mix' ? [stage.web, stage.phone] : stage.phones;
        for (const shot of used) expect(SHOT_IDS).toContain(shot);
        expect(Object.keys(SCENES)).toContain(forKind(audiencePages[page].scene, kind));
      }
    }
  });

  it('puts a laptop with one phone on the web pages and three phones in a row on the others', () => {
    const stages = (page: AudiencePageId) => forKind(audiencePages[page].stage, 'pilates');

    for (const page of ['gyms', 'studios'] as const) {
      const stage = stages(page);
      expect(stage.kind).toBe('mix');
      if (stage.kind === 'mix') {
        expect(shots[stage.web].device).toBe('browser');
        expect(shots[stage.phone].device).not.toBe('browser');
      }
    }
    for (const page of ['personalTrainers', 'clients'] as const) {
      const stage = stages(page);
      expect(stage.kind).toBe('row');
      if (stage.kind === 'row') {
        expect(stage.phones).toHaveLength(3);
        for (const phone of stage.phones) expect(shots[phone].device).not.toBe('browser');
      }
    }
  });

  it('has times that are clock times and never go back in a day', () => {
    for (const page of audiencePageIds) {
      const times = audiencePages[page].moments.map(({ time }) => time);
      for (const time of times) expect(time).toMatch(clock);
      expect([...times].sort()).toEqual(times);
    }
  });

  it('uses each of the owner’s colours for a moment’s bar: the product’s private, group, success and accent', () => {
    const colours = new Set(
      audiencePageIds.flatMap((page) => audiencePages[page].moments.map(({ colour }) => colour)),
    );
    expect([...colours].sort()).toEqual(['accent', 'group', 'private', 'success']);
  });
});

describe.each(locales)('F064 the four audience pages’ words in %s', (locale: Locale) => {
  const audience = messages[locale].site.audience;
  type Moments = Record<
    string,
    { question: string; answer: string; ticks: Record<string, string> }
  >;

  it('has the text of every moment, its chips and the page’s problems', () => {
    for (const page of audiencePageIds) {
      const copy = audience[page];
      const moments = copy.moments as Moments;
      expect(Object.keys(copy.pains)).toEqual(['one', 'two', 'three']);
      expect(Object.keys(moments).sort()).toEqual(
        audiencePages[page].moments.map(({ id }) => id).sort(),
      );
      for (const { id, ticks } of audiencePages[page].moments) {
        const moment = moments[id];
        expect(moment?.question.length, `${page} ${id}`).toBeGreaterThan(5);
        expect(moment?.answer.length, `${page} ${id}`).toBeGreaterThan(20);
        expect(Object.keys(moment?.ticks ?? {}), `${page} ${id}`).toEqual([...ticks]);
      }
    }
  });

  it('gives yoga its own word for the trainer, and says it where the text needs it', () => {
    const { words, moments } = audience.studios;

    expect(words.pilates.who).not.toBe(words.yoga.who);
    expect(moments.substitute.question).toContain('{who}');
    expect(moments.waitlist.question).toContain('{spots}');
  });

  it('says sportschool and never a word the glossary forbids, in Dutch', () => {
    if (locale !== 'nl-NL') return;
    const text = JSON.stringify(audience);

    expect(audience.gyms.eyebrow).toContain('Sportscholen');
    for (const forbidden of [
      /\bfitnesscentr/i,
      /\bfitnessclub/i,
      /\binvaller/i,
      /\bvervangende?\b/i,
    ]) {
      expect(text).not.toMatch(forbidden);
    }
    expect(text).toContain('vervanger');
    expect(text).toContain('tijdens het bijhouden');
    expect(text).toContain('aanmeldverzoek');
    expect(text).not.toMatch(/\baanvraag\b/i);
  });
});
