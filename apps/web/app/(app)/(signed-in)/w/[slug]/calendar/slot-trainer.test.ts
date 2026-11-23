import { describe, expect, it } from 'vitest';
import { NO_TRAINER } from './calendar-filters';
import { slotTrainerId } from './slot-trainer';

// F023 (ticket #537): which trainer an empty-slot click in the day view prefills in PS-01. A former
// trainer cannot be picked there, so her column prefills none, like *Geen trainer*.

describe('F023 slotTrainerId', () => {
  const former = [{ id: 'sarah' }];

  it('prefills the trainer of a current trainer’s column in the day view', () => {
    expect(slotTrainerId({ view: 'day', columnKey: 'tom', former })).toBe('tom');
  });

  it('prefills none in a former trainer’s column', () => {
    expect(slotTrainerId({ view: 'day', columnKey: 'sarah', former })).toBeUndefined();
  });

  it('prefills none in the Geen trainer column', () => {
    expect(slotTrainerId({ view: 'day', columnKey: NO_TRAINER, former })).toBeUndefined();
  });

  it('prefills none outside the day view, where a column is a day', () => {
    expect(slotTrainerId({ view: 'week', columnKey: '2026-11-23', former })).toBeUndefined();
  });
});
