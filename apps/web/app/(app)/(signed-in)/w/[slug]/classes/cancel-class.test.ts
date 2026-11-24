import { describe, expect, it } from 'vitest';
import { reachOf } from './cancel-class';

// F026 AC6, AC7, AC8 (spec #462, ticket #560): what CO-03 says each scope reaches, from the API's preview.
const counts = (participants: number, datesWithEmails: number) => ({
  datesCancelled: datesWithEmails,
  datesRemoved: 0,
  datesWithEmails,
  participants,
  emails: participants,
});

describe('F026 CO-03: what each scope reaches', () => {
  const preview = { thisDate: counts(3, 1), following: counts(5, 4) };

  it('AC6: Alleen deze les reaches the date’s own participants', () => {
    expect(reachOf(preview, 'this')).toEqual({ participants: 3, classes: 1 });
  });

  it('AC7: Deze en alle volgende lessen reaches the people and the dates of the rest of the series', () => {
    expect(reachOf(preview, 'following')).toEqual({ participants: 5, classes: 4 });
  });

  it('AC8: a date without participants reaches nobody', () => {
    expect(reachOf({ thisDate: counts(0, 0) }, 'this')).toEqual({ participants: 0, classes: 0 });
  });

  it('a date in no series has only itself, whatever the scope says', () => {
    expect(reachOf({ thisDate: counts(2, 1) }, 'following')).toEqual({
      participants: 2,
      classes: 1,
    });
  });
});
