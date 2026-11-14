import { useFormatter } from 'next-intl';

/**
 * How the session screens write a moment (ADR-012): the API gives UTC instants and the workspace's
 * time zone, and the screen formats them in that zone and the reader's language (`en` as `en-GB`,
 * 24-hour time). Dates: `do 24 sep` (`day`), `do 24 sep 2026` (`dayYear`); a typed local date
 * (`YYYY-MM-DD`, no time zone of its own) reads `24 september 2026` (`localDate`).
 */
export function useSessionFormat(timeZone: string) {
  const format = useFormatter();
  const day = { weekday: 'short', day: 'numeric', month: 'short' } as const;
  return {
    day: (instant: string | Date) => format.dateTime(new Date(instant), { timeZone, ...day }),
    dayYear: (instant: string | Date) =>
      format.dateTime(new Date(instant), { timeZone, ...day, year: 'numeric' }),
    longDay: (instant: string | Date) =>
      format.dateTime(new Date(instant), {
        timeZone,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    time: (instant: string | Date) =>
      format.dateTime(new Date(instant), {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
    /** A typed date such as `2027-03-28`, read as the calendar date it names, in any zone. */
    localDate: (localDate: string) =>
      format.dateTime(new Date(`${localDate}T12:00:00Z`), {
        timeZone: 'UTC',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
  };
}
