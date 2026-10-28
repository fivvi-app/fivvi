import { describe, expect, it } from 'vitest';
import { RESERVED_SLUGS, slugCandidates, slugFromName } from './slug.ts';

/** The first `count` candidates of a name. */
function first(name: string, count: number): string[] {
  const found: string[] = [];
  for (const slug of slugCandidates(name)) {
    found.push(slug);
    if (found.length === count) break;
  }
  return found;
}

describe('F002 the slug of a workspace name', () => {
  it('AC2: lower case, ASCII, words joined by hyphens', () => {
    expect(slugFromName("John's Gym")).toBe('johns-gym');
    expect(slugFromName('  Fit   &  Strong!  ')).toBe('fit-strong');
    expect(slugFromName('Studio 2B')).toBe('studio-2b');
  });

  it('AC2: apostrophes of every kind join the word instead of splitting it', () => {
    expect(slugFromName('John’s Gym')).toBe('johns-gym');
    expect(slugFromName('Jan`s Gym')).toBe('jans-gym');
  });

  it('AC2: transliterates accents and letters ASCII lacks', () => {
    expect(slugFromName('Café Crème')).toBe('cafe-creme');
    expect(slugFromName('Sportschool Zoë & Ñandú')).toBe('sportschool-zoe-nandu');
    expect(slugFromName('Straße Æsir Øre Łódź Œuvre Þor Đa')).toBe(
      'strasse-aesir-ore-lodz-oeuvre-thor-da',
    );
  });

  it('AC2: separators of every kind become one hyphen, and none are left at the ends', () => {
    expect(slugFromName('--Gym___Plus--')).toBe('gym-plus');
    expect(slugFromName('A / B . C')).toBe('a-b-c');
  });

  it('AC2: a name with nothing to transliterate still gets a slug', () => {
    expect(slugFromName('!!!')).toBe('workspace');
    expect(slugFromName('健身房')).toBe('workspace');
  });

  it('AC2: the first candidate is the slug, then the same with a number from 2', () => {
    expect(first("John's Gym", 4)).toEqual([
      'johns-gym',
      'johns-gym-2',
      'johns-gym-3',
      'johns-gym-4',
    ]);
  });

  it('AC2: a taken slug is skipped by the caller taking the next candidate', () => {
    const taken = new Set(['johns-gym', 'johns-gym-2']);
    const free = [...first("John's Gym", 5)].find((slug) => !taken.has(slug));
    expect(free).toBe('johns-gym-3');
  });

  it('AC2: reserved words are skipped, in the name and with a number', () => {
    expect(first('API', 2)).toEqual(['api-2', 'api-3']);
    expect(first('Book', 1)).toEqual(['book-2']);
    expect(first('W', 1)).toEqual(['w-2']);
    for (const word of ['api', 'w', 'book', 'my', 'login', 'welcome']) {
      expect(RESERVED_SLUGS).toContain(word);
    }
  });

  it('AC2: a reserved word inside a longer slug is not reserved', () => {
    expect(first('My Gym', 1)).toEqual(['my-gym']);
  });

  it('never makes a candidate that is reserved', () => {
    for (const word of RESERVED_SLUGS) {
      expect(first(word, 3).filter((slug) => RESERVED_SLUGS.includes(slug))).toEqual([]);
    }
  });

  it('only makes slugs of lower case letters, digits and single hyphens', () => {
    for (const name of ["John's Gym", 'Ünïcödé!', '--x--', '!!!', 'A  B']) {
      for (const slug of first(name, 3)) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});
