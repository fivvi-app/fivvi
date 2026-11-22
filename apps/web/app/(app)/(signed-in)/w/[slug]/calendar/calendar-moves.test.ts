import { describe, expect, it } from 'vitest';
import { proposeMove } from './calendar-moves';

// F014 WC-07 (ticket #531): what dropping a block on another time of the grid proposes. The grid
// only proposes a new start; the API applies every rule (`proposeMove` words nothing and decides
// none of them, it only turns a drop into the values F020's reschedule and F022's date edit take).

const AMSTERDAM = 'Europe/Amsterdam';
const NOW = new Date('2026-09-10T08:00:00Z');
// Tuesday 22 September 2026: Mark 07:00-08:00 and Kracht 10:00-11:00, Amsterdam time.
const mark = {
  type: 'private' as const,
  startsAt: '2026-09-22T05:00:00Z',
  endsAt: '2026-09-22T06:00:00Z',
};
const kracht = {
  type: 'group' as const,
  startsAt: '2026-09-29T08:00:00Z',
  endsAt: '2026-09-29T09:00:00Z',
};

describe('F014 WC-07: a drop proposes a new start', () => {
  it('a private session keeps its length and goes to the dropped date and time', () => {
    expect(proposeMove(mark, { date: '2026-09-22', time: '08:00' }, AMSTERDAM, NOW)).toEqual({
      ok: true,
      from: { date: '2026-09-22', time: '07:00' },
      to: { date: '2026-09-22', time: '08:00' },
      localDate: '2026-09-22',
      localStart: '08:00',
      localEnd: '09:00',
      durationMinutes: 60,
      past: false,
      unchanged: false,
    });
  });

  it('a private session can go to another day', () => {
    const proposal = proposeMove(mark, { date: '2026-09-23', time: '14:15' }, AMSTERDAM, NOW);
    expect(proposal).toMatchObject({
      ok: true,
      localDate: '2026-09-23',
      localStart: '14:15',
      localEnd: '15:15',
    });
  });

  it('a class date keeps its length: the end moves with the start, on the same day', () => {
    expect(
      proposeMove(kracht, { date: '2026-09-29', time: '10:30' }, AMSTERDAM, NOW),
    ).toMatchObject({
      ok: true,
      from: { date: '2026-09-29', time: '10:00' },
      localStart: '10:30',
      localEnd: '11:30',
      durationMinutes: 60,
    });
  });

  it('a class date that would end after midnight is no move', () => {
    expect(proposeMove(kracht, { date: '2026-09-29', time: '23:30' }, AMSTERDAM, NOW)).toEqual({
      ok: false,
      reason: 'crossesMidnight',
    });
  });

  it('a drop on the time it started at changes nothing', () => {
    expect(proposeMove(mark, { date: '2026-09-22', time: '07:00' }, AMSTERDAM, NOW)).toMatchObject({
      ok: true,
      unchanged: true,
    });
  });

  it('a time before now is flagged as past; the API decides what that means for the session', () => {
    expect(proposeMove(mark, { date: '2026-09-09', time: '08:00' }, AMSTERDAM, NOW)).toMatchObject({
      ok: true,
      past: true,
    });
  });

  it('a time the clocks skip is no move', () => {
    expect(proposeMove(mark, { date: '2027-03-28', time: '02:30' }, AMSTERDAM, NOW)).toEqual({
      ok: false,
      reason: 'doesNotExist',
    });
  });
});
