import { instantToWallClock } from '@fivvi/domain/zoned-time';
import { previewTimes, wallClockOf } from '../sessions/session-time';

// F014 WC-07: what dropping a block on another time of the grid asks for. The grid only proposes a
// new start; the API applies every rule (F020's reschedule, F022's date edit) and answers 409 on a
// stale version. Nothing is decided here beyond what the two writes take as input (ADR-012).

/** A place on the grid as the wall clock of the workspace's time zone. */
export interface WallPlace {
  /** `YYYY-MM-DD`. */
  date: string;
  /** `HH:mm`. */
  time: string;
}

export type MoveProposal =
  | {
      ok: true;
      from: WallPlace;
      to: WallPlace;
      /** For F020's reschedule. */
      localDate: string;
      localStart: string;
      durationMinutes: number;
      /** For F022's date edit: the same day, the end moved with the start. */
      localEnd: string;
      /** The new start is before now. */
      past: boolean;
      /** The drop is on the place the block started at: nothing to ask. */
      unchanged: boolean;
    }
  /** The start does not exist on that day: the clocks skip it. */
  | { ok: false; reason: 'doesNotExist' }
  /** A class date's end must be on the day of its start. */
  | { ok: false; reason: 'crossesMidnight' };

/** Turns a drop of `item` on `to` into the values of a move; the length is kept. */
export function proposeMove(
  item: { type: 'private' | 'group'; startsAt: string; endsAt: string },
  to: WallPlace,
  timeZone: string,
  now: Date,
): MoveProposal {
  const {
    localDate: fromDate,
    localStart: fromTime,
    durationMinutes,
  } = wallClockOf(item, timeZone);
  const placed = previewTimes({
    localDate: to.date,
    localStart: to.time,
    durationMinutes,
    timeZone,
    now,
  });
  if (placed.status !== 'placed') return { ok: false, reason: 'doesNotExist' };
  if (item.type === 'group' && placed.endsNextDay) return { ok: false, reason: 'crossesMidnight' };
  return {
    ok: true,
    from: { date: fromDate, time: fromTime },
    to,
    localDate: to.date,
    localStart: to.time,
    localEnd: placed.endTime,
    durationMinutes,
    past: placed.past,
    unchanged: fromDate === to.date && fromTime === to.time,
  };
}

/** The wall-clock place a stored instant is at. */
export function placeOf(instant: string, timeZone: string): WallPlace {
  const { date, time } = instantToWallClock(new Date(instant), timeZone);
  return { date, time };
}
