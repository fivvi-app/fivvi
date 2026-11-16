import type { Schemas } from '@fivvi/contract';
import type { Route } from 'next';
import Link from 'next/link';
import { type DateTimeFormatOptions, useFormatter, useTranslations } from 'next-intl';
import { useSessionFormat } from '../../../w/[slug]/sessions/use-session-format';

type Day = Schemas['MyDay'];
type Item = Schemas['PersonalSession'];

const rowClass = 'flex min-h-11 items-start gap-3 rounded-lg px-3 py-2 hover:bg-muted';

/**
 * *Mijn dag* / *My day* (`/me/day`, F013): the same content as TD-01 *Vandaag* of the apps, as a
 * list in the row format of WC-01 (`flows/03-workspace-calendar.md`): the time, the client or the
 * class, the type in words with its location or bookings, and the workspace only when the person
 * trains in more than one. Everything shown is what `GET /v1/me/day` answers: the web decides
 * nothing (ordering, *Straks*, the summary and the tomorrow line are the domain's, in the API).
 *
 * *Straks* / *Nu bezig* is on top and not repeated in the list; every other item of the day follows
 * in time order, past ones dimmed, cancelled ones struck through with *Geannuleerd*. Each row is
 * one link that opens the session in its own workspace, with that workspace's permissions
 * (`/w/{slug}/sessions/{id}`). A row is at least 44 px high, and the page is one column at any
 * width. Times are Dutch time, the only zone of the personal scope (`day.timeZone`).
 */
export function MyDayView({ day, now }: { day: Day; now: Date }) {
  const t = useTranslations('myDay');
  const format = useFormatter();
  const when = useSessionFormat(day.timeZone);
  // Open Gym comes later (`PRODUCT.md §53`): no screen shows it yet.
  const items = day.items.filter((item) => item.type !== 'open_gym');
  const next = day.next ? items.find((item) => item.sessionId === day.next?.sessionId) : undefined;
  const rest = items.filter((item) => item !== next);
  const calendarDay = (date: string, style: DateTimeFormatOptions) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), { timeZone: 'UTC', ...style });

  const summary =
    day.summary.count > 0 && day.summary.firstStartsAt && day.summary.lastEndsAt
      ? t('summary', {
          count: day.summary.count,
          first: when.time(day.summary.firstStartsAt),
          last: when.time(day.summary.lastEndsAt),
        })
      : t('summaryNone');

  function row(item: Item) {
    const cancelled = item.status === 'cancelled';
    const past = new Date(item.endsAt) <= now;
    const isPrivate = item.type === 'private';
    const title = (isPrivate ? item.clientName : item.className) ?? typeOf(item);
    const detail = isPrivate
      ? item.location?.name
      : t('booked', { booked: item.booked ?? 0, capacity: item.capacity });
    return (
      <Link
        href={`/w/${item.workspace.slug}/sessions/${item.sessionId}` as Route}
        className={`${rowClass} ${past || cancelled ? 'text-muted-foreground' : ''}`}
        // One screen-reader element per row, with a pause between its parts (`02-trainer-today.md`).
        aria-label={spoken(item, title, detail, cancelled)}
      >
        <span className="w-24 shrink-0 pt-px text-sm font-medium tabular-nums">
          {t('timeRange', { start: when.time(item.startsAt), end: when.time(item.endsAt) })}
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className={`truncate font-medium ${cancelled ? 'line-through' : ''}`}>{title}</span>
          <span className="truncate text-sm text-muted-foreground">
            {detail ? t('typeWithDetail', { type: typeOf(item), detail }) : typeOf(item)}
          </span>
          {day.workspaceCount > 1 ? (
            <span className="truncate text-sm text-muted-foreground">{item.workspace.name}</span>
          ) : null}
          {cancelled ? <span className="text-sm font-medium">{t('cancelled')}</span> : null}
        </span>
      </Link>
    );
  }

  /** "09:00 tot 10:00, Anna, privésessie, Studio Zuid, Sarah Personal Training": the row as one phrase. */
  function spoken(item: Item, title: string, detail: string | undefined, cancelled: boolean) {
    const parts = [
      t('spokenTime', { start: when.time(item.startsAt), end: when.time(item.endsAt) }),
      title,
      typeOf(item),
      detail,
      day.workspaceCount > 1 ? item.workspace.name : undefined,
      cancelled ? t('cancelled') : undefined,
    ].filter((part): part is string => Boolean(part));
    return parts.reduce((first, next) => t('spokenJoin', { first, next }));
  }

  function typeOf(item: Item) {
    return item.type === 'private' ? t('typePrivate') : t('typeGroup');
  }

  let empty: string | undefined;
  if (items.length === 0) {
    if (day.tomorrow || (day.nextSessionDate === undefined && day.hasSessions)) {
      empty = t('emptyToday');
    } else if (day.nextSessionDate) {
      empty = t('emptyNext', {
        date: calendarDay(day.nextSessionDate, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }),
      });
    } else {
      empty = t('emptyNever');
    }
  }

  return (
    <main className="flex-1 px-4 pt-5 pb-10 md:px-6">
      <div className="grid max-w-275 content-start gap-4">
        <header className="grid gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">
            {calendarDay(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <p className="text-sm font-medium">{summary}</p>
        </header>

        {next && day.next ? (
          <section className="grid gap-1 rounded-xl border bg-card p-2">
            <h2 className="px-3 pt-2 text-xs font-semibold tracking-wide text-accent-text uppercase">
              {day.next.state === 'in_progress'
                ? t('nextInProgress')
                : t('nextUpcoming', { minutes: day.next.startsInMinutes })}
            </h2>
            {row(next)}
          </section>
        ) : null}

        {rest.length > 0 ? (
          <section aria-labelledby="my-day-list">
            <h2 id="my-day-list" className="sr-only">
              {t('listLabel')}
            </h2>
            <ul className="grid gap-px">
              {rest.map((item) => (
                <li key={item.sessionId}>{row(item)}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {empty ? <p>{empty}</p> : null}

        {day.tomorrow ? (
          <p className="border-t pt-3 text-sm text-muted-foreground">
            {t('tomorrow', {
              count: day.tomorrow.count,
              time: when.time(day.tomorrow.firstStartsAt),
            })}
          </p>
        ) : null}
      </div>
    </main>
  );
}
