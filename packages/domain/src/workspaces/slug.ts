/**
 * The URL name of a workspace (`/w/{slug}`, booking pages, QR codes), made from its name once
 * and never changed by a rename (F002 AC2, AC6).
 */

/**
 * Words that are routes of the site or would be mistaken for one: a workspace can't take them
 * as its slug. A name that makes one gets a number (`api-2`).
 */
export const RESERVED_SLUGS: readonly string[] = [
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'book',
  'booking',
  'client',
  'clients',
  'health',
  'help',
  'login',
  'logout',
  'me',
  'my',
  'new',
  'next',
  'settings',
  'sign-in',
  'sign-out',
  'signin',
  'signout',
  'static',
  'support',
  'v1',
  'w',
  'welcome',
  'workspaces',
  'www',
];

/** Used when a name leaves nothing of its own (only symbols, or a script we don't transliterate). */
const FALLBACK = 'workspace';

/** Letters that decomposing (NFKD) doesn't turn into ASCII. */
const TRANSLITERATION: Readonly<Record<string, string>> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ł: 'l',
  þ: 'th',
  ı: 'i',
};

const APOSTROPHES = /['‘’`´ʼ]/g;
const COMBINING_MARKS = /\p{M}/gu;
const NOT_ALPHANUMERIC = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;

/** The slug a name makes before any number: ASCII, lower case, words joined by hyphens. */
export function slugFromName(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(/[ßæœøđðłþı]/g, (letter) => TRANSLITERATION[letter] ?? letter);
  return ascii.replace(NOT_ALPHANUMERIC, '-').replace(EDGE_HYPHENS, '') || FALLBACK;
}

/**
 * The slugs a name may take, best first: `johns-gym`, `johns-gym-2`, `johns-gym-3`, … without
 * the reserved ones. The caller takes the first that is free (the database's unique index says
 * which are taken, and the workspaces of other people are out of its sight). Endless: the
 * caller stops.
 */
export function* slugCandidates(name: string): Generator<string, never> {
  const base = slugFromName(name);
  if (!RESERVED_SLUGS.includes(base)) yield base;
  for (let number = 2; ; number += 1) {
    const candidate = `${base}-${number}`;
    if (!RESERVED_SLUGS.includes(candidate)) yield candidate;
  }
}
