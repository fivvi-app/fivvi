import { describe, expect, it } from 'vitest';
import { hasMoreThanOneSessionType, workspaceSessionTypes } from './personal-session-types.ts';

// F013 (spec #457, ticket #1534): which session types a workspace runs, and when the personal views name the kind
// of a session. Synthetic people: Sarah is a Trainer at John's Gym (private sessions and classes) and
// the Owner of Sarah Personal Training (private sessions only).

describe('workspaceSessionTypes', () => {
  it('a workspace with no class runs private sessions only', () => {
    expect(workspaceSessionTypes({ hasGroupClasses: false })).toEqual(['private']);
  });

  it('a workspace with a class runs private sessions and group classes, in that order', () => {
    expect(workspaceSessionTypes({ hasGroupClasses: true })).toEqual(['private', 'group']);
  });
});

describe('hasMoreThanOneSessionType', () => {
  const privateOnly = workspaceSessionTypes({ hasGroupClasses: false });
  const both = workspaceSessionTypes({ hasGroupClasses: true });

  it('Sarah, in a workspace with both kinds, sees the label whatever the day holds', () => {
    expect(hasMoreThanOneSessionType([privateOnly, both])).toBe(true);
    expect(hasMoreThanOneSessionType([both])).toBe(true);
  });

  it('a person whose workspaces run only private sessions never sees it', () => {
    expect(hasMoreThanOneSessionType([privateOnly])).toBe(false);
    expect(hasMoreThanOneSessionType([privateOnly, privateOnly])).toBe(false);
  });

  it('a person who trains nowhere sees none', () => {
    expect(hasMoreThanOneSessionType([])).toBe(false);
  });
});
