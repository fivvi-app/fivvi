import { describe, expect, it } from 'vitest';
import { offersMoreThanOneKind, workspaceOffers } from './personal-offers.ts';

// F013 (spec #457, ticket #1534): what a workspace offers, and when the personal views name the kind
// of a session. Synthetic people: Sarah is a Trainer at John's Gym (private sessions and classes) and
// the Owner of Sarah Personal Training (private sessions only).

describe('workspaceOffers', () => {
  it('a workspace with no class offers private sessions only', () => {
    expect(workspaceOffers({ hasGroupClasses: false })).toEqual(['private']);
  });

  it('a workspace with a class offers private sessions and group classes, in that order', () => {
    expect(workspaceOffers({ hasGroupClasses: true })).toEqual(['private', 'group']);
  });
});

describe('offersMoreThanOneKind', () => {
  const privateOnly = workspaceOffers({ hasGroupClasses: false });
  const both = workspaceOffers({ hasGroupClasses: true });

  it('Sarah, in a workspace with both kinds, sees the label whatever the day holds', () => {
    expect(offersMoreThanOneKind([privateOnly, both])).toBe(true);
    expect(offersMoreThanOneKind([both])).toBe(true);
  });

  it('a person whose workspaces offer only private sessions never sees it', () => {
    expect(offersMoreThanOneKind([privateOnly])).toBe(false);
    expect(offersMoreThanOneKind([privateOnly, privateOnly])).toBe(false);
  });

  it('a person who trains nowhere sees none', () => {
    expect(offersMoreThanOneKind([])).toBe(false);
  });
});
