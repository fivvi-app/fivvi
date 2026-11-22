import type { Schemas } from '@fivvi/contract';
import { describe, expect, it } from 'vitest';
import {
  dayFigures,
  hasMixedKinds,
  laneTimeline,
  stillToday,
  toggleShown,
} from './dashboard-model';

// F014 (spec #458, ticket #532): what the Owner's Dashboard computes from the day the API answers.
// Tuesday 22 September 2026 in Pilot Gym: Sven's private session 07:00, Kracht 10:00 (Sven,
// capacity 8, 3 booked), Noor's private session 11:00, Kracht 18:00 cancelled. Times are Dutch
// summer time (UTC+2).
type Item = Schemas['WorkspaceCalendarSession'];
const base: Item = {
  id: 's-mark',
  type: 'private',
  status: 'scheduled',
  startsAt: '2026-09-22T05:00:00.000Z',
  endsAt: '2026-09-22T06:00:00.000Z',
  timeZone: 'Europe/Amsterdam',
  capacity: 1,
  version: 1,
  location: {
    id: 'l1',
    name: 'Pilot Gym',
    type: 'organization_location',
    address: null,
    isDefault: true,
  },
  trainer: { id: 'm-sven', name: 'Sven' },
  clientName: 'Mark Jansen',
};
const kracht: Item = {
  ...base,
  id: 's-kracht',
  type: 'group',
  startsAt: '2026-09-22T08:00:00.000Z',
  endsAt: '2026-09-22T09:00:00.000Z',
  capacity: 8,
  booked: 3,
  className: 'Kracht',
  clientName: undefined,
};
const lisa: Item = {
  ...base,
  id: 's-lisa',
  startsAt: '2026-09-22T09:00:00.000Z',
  endsAt: '2026-09-22T10:00:00.000Z',
  trainer: { id: 'm-noor', name: 'Noor' },
  clientName: 'Lisa Smit',
};
const cancelled: Item = {
  ...kracht,
  id: 's-cancelled',
  status: 'cancelled',
  startsAt: '2026-09-22T16:00:00.000Z',
  endsAt: '2026-09-22T17:00:00.000Z',
};
const day = [base, kracht, lisa, cancelled];
const at = (time: string) => new Date(`2026-09-22T${time}:00.000Z`);

describe('the tiles', () => {
  it('counts the sessions that took place or are still to come, never the cancelled one', () => {
    // 08:30 Dutch time: Mark's session is over, Kracht is running.
    expect(dayFigures(day, at('06:30'))).toEqual({
      done: 1,
      total: 3,
      groupBooked: 3,
      groupCapacity: 8,
      hasGroup: true,
    });
    expect(dayFigures(day, at('10:30')).done).toBe(3);
  });

  it('has no group spots on a day without a class', () => {
    expect(dayFigures([base, lisa], at('06:30'))).toMatchObject({
      hasGroup: false,
      groupBooked: 0,
      groupCapacity: 0,
    });
  });

  it('adds up the places of every class date of the day', () => {
    const second = { ...kracht, id: 's-second', booked: 5, capacity: 6 };
    expect(dayFigures([kracht, second], at('06:30'))).toMatchObject({
      groupBooked: 8,
      groupCapacity: 14,
    });
  });
});

describe('Nog vandaag', () => {
  it('lists what has not ended yet, in time order, without the cancelled one', () => {
    // At 11:10 Dutch time Kracht is over and Lisa's session is running.
    expect(stillToday(day, at('09:10')).map((item) => item.id)).toEqual(['s-lisa']);
    expect(stillToday(day, at('03:00')).map((item) => item.id)).toEqual([
      's-mark',
      's-kracht',
      's-lisa',
    ]);
    expect(stillToday(day, at('12:00'))).toEqual([]);
  });
});

describe('the type words', () => {
  it('are needed only when private sessions and classes are both there', () => {
    expect(hasMixedKinds(day)).toBe(true);
    expect(hasMixedKinds([base, lisa])).toBe(false);
    expect(hasMixedKinds([kracht])).toBe(false);
    // A cancelled class does not make the day mixed.
    expect(hasMixedKinds([base, cancelled])).toBe(false);
  });
});

describe('the lanes', () => {
  it('has one lane per trainer, the Owner first, and one last for what has no trainer', () => {
    const boxing: Item = { ...kracht, id: 's-boxing', trainer: undefined, className: 'Boxing' };
    const timeline = laneTimeline([lisa, base, boxing, kracht], 'Europe/Amsterdam', 'm-noor');
    expect(timeline?.lanes.map((lane) => lane.trainer?.name ?? null)).toEqual([
      'Noor',
      'Sven',
      null,
    ]);
    expect(timeline?.lanes.map((lane) => lane.own)).toEqual([true, false, false]);
  });

  it('runs from the first full hour to the last full hour of the day, on the clock', () => {
    const timeline = laneTimeline(day, 'Europe/Amsterdam', 'm-sven');
    // 07:00 to 19:00 with the cancelled evening class, a mark at both ends too.
    expect(timeline).toMatchObject({ firstHour: 7, endHour: 19 });
    expect(timeline?.hours.map((hour) => hour.label)).toEqual(
      Array.from({ length: 13 }, (_, index) => `${String(7 + index).padStart(2, '0')}:00`),
    );
  });

  it('places a block by its start and length as a share of the day shown', () => {
    const timeline = laneTimeline(day, 'Europe/Amsterdam', 'm-sven');
    const sven = timeline?.lanes.find((lane) => lane.trainer?.id === 'm-sven');
    const block = sven?.blocks.find((entry) => entry.item.id === 's-kracht');
    // 10:00 to 11:00 of 07:00 to 19:00.
    expect(block?.left).toBeCloseTo((3 / 12) * 100);
    expect(block?.width).toBeCloseTo((1 / 12) * 100);
  });

  it('puts sessions at the same time of one trainer side by side, in rows of the lane', () => {
    const together: Item = { ...kracht, id: 's-together', startsAt: base.startsAt };
    const timeline = laneTimeline([base, together, kracht], 'Europe/Amsterdam', 'm-sven');
    const lane = timeline?.lanes[0];
    expect(lane?.rows).toBe(2);
    expect(lane?.blocks.find((block) => block.item.id === 's-mark')?.row).toBe(0);
    expect(lane?.blocks.find((block) => block.item.id === 's-together')?.row).toBe(1);
    expect(lane?.blocks.find((block) => block.item.id === 's-kracht')?.row).toBe(0);
  });

  it('is nothing for a day without sessions', () => {
    expect(laneTimeline([], 'Europe/Amsterdam', 'm-sven')).toBeUndefined();
  });
});

describe('the Mijn dag toggle', () => {
  it('shows for an Owner who trains and has someone else on the team', () => {
    expect(toggleShown({ trains: true, trainerIds: ['m-john', 'm-sarah'], ownId: 'm-john' })).toBe(
      true,
    );
  });

  it('does not show for a solo PT, whom nobody else trains with', () => {
    expect(toggleShown({ trains: true, trainerIds: ['m-john'], ownId: 'm-john' })).toBe(false);
  });

  it('does not show for an Owner without a trainer profile', () => {
    expect(toggleShown({ trains: false, trainerIds: ['m-sarah'], ownId: 'm-john' })).toBe(false);
  });
});
