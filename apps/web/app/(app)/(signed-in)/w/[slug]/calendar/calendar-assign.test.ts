import { describe, expect, it } from 'vitest';
import { assignTargetOf } from './calendar-assign';
import { NO_TRAINER } from './calendar-filters';

// F023 (spec #459, ticket #541) WC-03: dragging a block to another trainer's column of the day view
// asks to assign that trainer. Columns are keyed by the trainer's team-member ID.
const trainers = [
  { id: 'sarah', name: 'Sarah' },
  { id: 'tom', name: 'Tom' },
];
const boxing = { type: 'group' as const, status: 'scheduled' as const };
const mark = {
  type: 'private' as const,
  status: 'scheduled' as const,
  trainer: { id: 'sarah', name: 'Sarah' },
};
const drop = (overrides: Partial<Parameters<typeof assignTargetOf>[0]> = {}) =>
  assignTargetOf({
    view: 'day',
    item: boxing,
    fromColumnKey: NO_TRAINER,
    toColumnKey: 'tom',
    trainers,
    canAssign: true,
    ...overrides,
  });

describe('F023 WC-03: dragging a block to another trainer’s column', () => {
  it('AC1: Boxing, without a trainer, dropped on Tom’s column asks for Tom', () => {
    expect(drop()).toBe('tom');
  });

  it('Lisa’s private session dropped on Sarah’s column asks for Sarah', () => {
    expect(
      drop({
        item: { ...mark, trainer: { id: 'tom', name: 'Tom' } },
        fromColumnKey: 'tom',
        toColumnKey: 'sarah',
      }),
    ).toBe('sarah');
  });

  it('a class date of a series that has a trainer can be given to another one', () => {
    const series = {
      id: 'r1',
      weekday: 'TU' as const,
      localStartTime: '18:00',
      occurrenceDate: '2026-10-06',
      changedFields: [],
    };
    expect(
      drop({
        item: { ...boxing, trainer: { id: 'sarah', name: 'Sarah' }, series },
        fromColumnKey: 'sarah',
      }),
    ).toBe('tom');
  });

  it('F024 AC1: a one-off class date that has a trainer can be substituted by dragging too', () => {
    expect(
      drop({
        item: { ...boxing, trainer: { id: 'sarah', name: 'Sarah' } },
        fromColumnKey: 'sarah',
      }),
    ).toBe('tom');
  });

  it('nothing is asked in the week view, on the same column, on Geen trainer or on a former trainer’s column', () => {
    expect(drop({ view: 'week' })).toBeUndefined();
    expect(drop({ item: mark, fromColumnKey: 'tom' })).toBeUndefined();
    expect(drop({ toColumnKey: NO_TRAINER })).toBeUndefined();
    expect(drop({ toColumnKey: 'former' })).toBeUndefined();
  });

  it('AC12: a person who may not assign (a Trainer) is asked nothing, and a cancelled block never is', () => {
    expect(drop({ canAssign: false })).toBeUndefined();
    expect(drop({ item: { ...boxing, status: 'cancelled' } })).toBeUndefined();
  });
});
