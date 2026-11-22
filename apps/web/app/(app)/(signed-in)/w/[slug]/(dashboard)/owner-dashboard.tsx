import type { Schemas } from '@fivvi/contract';
import type { TrainerWordForms } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { sessionBlockVariants } from '@fivvi/ui/kit/session-block';
import type { Route } from 'next';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { TimeZoneHint } from '../../../me/(personal)/time-zone-hint';
import { ScopeToggle } from '../scope-toggle';
import { useSessionFormat } from '../sessions/use-session-format';
import {
  type DaySession,
  dayFigures,
  hasMixedKinds,
  laneTimeline,
  stillToday,
} from './dashboard-model';
import { EmptyDayActions } from './empty-day-actions';

type Shown = DaySession & { type: 'private' | 'group' };

/** The height of a block in a lane and the gap between the rows of a lane, in px. */
const BLOCK_PX = 36;
const ROW_GAP_PX = 4;
/** Room for the name of a session: an hour of the lanes is this wide, so the timeline scrolls on a narrow screen. */
const HOUR_REM = 8;
const LABEL_REM = 9;

/**
 * The Owner's Dashboard (`/w/{slug}`, WC-01, F014): today in the workspace as
 * `GET /v1/workspaces/{workspaceId}/day` answers it. The tiles, the lanes (a row per trainer),
 * *Aandacht nodig* and *Nog vandaag* are drawn from that one answer: the API decides what needs
 * attention and what the busiest moment is, this screen counts nothing but what is on the tiles
 * and words it all. A session opens `/w/{slug}/sessions/{id}`, which is CO-01 for a class date.
 * Times are the workspace's wall clock (ADR-012). Colour only supports: a block starts with the
 * session's name and, where private sessions and classes both are there, says its type.
 */
export function OwnerDashboard({
  day,
  now,
  workspace,
  slug,
  teamMemberId,
  trainerWord,
  showToggle,
}: {
  day: Schemas['WorkspaceDay'];
  /** The moment the page was drawn, an ISO instant: what is done and what is still to come. */
  now: string;
  /** The workspace's name. */
  workspace: string;
  slug: string;
  /** The signed-in Owner's own team-member ID: *Jij*. */
  teamMemberId: string;
  /** The workspace's word for the people who teach (F068), in the reader's language. */
  trainerWord: TrainerWordForms;
  /** The Owner trains and has a team: *Mijn dag | {workspace}*. */
  showToggle: boolean;
}) {
  const t = useTranslations('workspaceDashboard');
  const calendar = useTranslations('workspaceCalendar');
  const shared = useTranslations('myCalendar');
  const format = useFormatter();
  const when = useSessionFormat(day.timeZone);
  const current = new Date(now);
  const items = day.items.filter((item): item is Shown => item.type !== 'open_gym');
  const figures = dayFigures(items, current);
  const mixed = hasMixedKinds(items);
  const upcoming = stillToday(items, current) as Shown[];
  const lanes = laneTimeline(items, day.date, day.timeZone, teamMemberId);
  const todayLabel = format.dateTime(new Date(`${day.date}T12:00:00Z`), {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const typeOf = (item: Shown) =>
    item.type === 'private' ? shared('typePrivate') : shared('typeGroup');
  const nameOf = (item: Shown) =>
    (item.type === 'private' ? item.clientName : item.className) ?? typeOf(item);
  const trainerOf = (item: Shown) =>
    item.trainer
      ? item.trainer.id === teamMemberId
        ? calendar('you')
        : item.trainer.name
      : calendar('noTrainerMark', { ...trainerWord });
  const href = (item: Shown) => `/w/${slug}/sessions/${item.id}` as Route;
  const timeRange = (item: Shown) =>
    shared('timeRange', { start: when.time(item.startsAt), end: when.time(item.endsAt) });
  const booked = (item: Shown) =>
    shared('blockBooked', { booked: item.booked ?? 0, capacity: item.capacity });

  /** "Groep · Kracht, 10:00 tot 11:00, Sven, 3 van 8 geboekt": the block as one phrase. */
  function spoken(item: Shown) {
    return [
      shared('block', { type: typeOf(item), name: nameOf(item) }),
      shared('spokenTime', { start: when.time(item.startsAt), end: when.time(item.endsAt) }),
      trainerOf(item),
      item.type === 'group'
        ? calendar('spokenBooked', { booked: item.booked ?? 0, capacity: item.capacity })
        : undefined,
      item.status === 'cancelled' ? shared('cancelled') : undefined,
    ]
      .filter((part): part is string => Boolean(part))
      .reduce((first, next) => shared('spokenJoin', { first, next }));
  }

  /** The second line of a block: the time, the places of a class and, with both kinds there, the type. */
  function detail(item: Shown) {
    if (item.status === 'cancelled') return shared('cancelled');
    const line =
      item.type === 'group'
        ? t('blockDetail', { time: when.time(item.startsAt), booked: booked(item) })
        : when.time(item.startsAt);
    return mixed ? shared('block', { type: typeOf(item), name: line }) : line;
  }

  const attention = day.attention.filter((item): item is Shown => item.type !== 'open_gym');
  const attentionText = (item: Shown) =>
    t('attentionNoTrainer', {
      ...trainerWord,
      name:
        item.type === 'private'
          ? shared('block', { type: typeOf(item), name: nameOf(item) })
          : nameOf(item),
      date: when.day(item.startsAt),
      time: when.time(item.startsAt),
    });

  return (
    <main className="flex-1 px-4 pt-5 pb-10 md:px-6">
      <div className="grid max-w-275 content-start gap-4">
        <header className="grid gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
            {t('today', { date: todayLabel })}
          </p>
          <TimeZoneHint zone={day.timeZone} />
        </header>

        {showToggle ? <ScopeToggle current="workspace" slug={slug} workspace={workspace} /> : null}

        {items.length === 0 ? (
          <div className="grid justify-items-start gap-2">
            {day.hasSessions ? (
              <>
                <p>{t('emptyDay', { workspace })}</p>
                <EmptyDayActions />
              </>
            ) : (
              <>
                <p>{t('welcome')}</p>
                <EmptyDayActions welcome />
              </>
            )}
          </div>
        ) : (
          <>
            <ul
              aria-label={t('kpiLabel')}
              className={`grid gap-3 ${figures.hasGroup ? 'sm:grid-cols-2' : ''}`}
            >
              <Tile
                label={t('sessionsToday')}
                value={t('fraction', { count: figures.done, total: figures.total })}
                note={t('sessionsDone')}
                share={figures.total ? figures.done / figures.total : 0}
                tone="private"
              />
              {figures.hasGroup ? (
                <Tile
                  label={t('groupSpots')}
                  value={t('fraction', {
                    count: figures.groupBooked,
                    total: figures.groupCapacity,
                  })}
                  note={t('groupBooked')}
                  share={figures.groupCapacity ? figures.groupBooked / figures.groupCapacity : 0}
                  tone="group"
                />
              ) : null}
            </ul>

            {lanes ? (
              <Card className="shadow-xs [--card-spacing:--spacing(5)]">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">
                    <h2>{t('lanesTitle', { workspace })}</h2>
                  </CardTitle>
                  <CardDescription>{t('lanesNote', { ...trainerWord })}</CardDescription>
                </CardHeader>
                <section
                  aria-label={t('lanesLabel', { ...trainerWord })}
                  // Scrollable when the hours do not fit, so the keyboard can scroll it too.
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable.
                  tabIndex={0}
                  className="mx-(--card-spacing) overflow-x-auto"
                >
                  <div
                    className="grid gap-2"
                    style={{
                      minWidth: `${LABEL_REM + (lanes.endHour - lanes.firstHour) * HOUR_REM}rem`,
                    }}
                  >
                    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-2" aria-hidden="true">
                      <span />
                      <span className="relative block h-4 text-xs text-muted-foreground tabular-nums">
                        {lanes.hours.map((hour, index) => (
                          <span
                            key={hour.hour}
                            className={`absolute top-0 ${index === lanes.hours.length - 1 ? '-translate-x-full' : ''}`}
                            style={{ left: `${hour.left}%` }}
                          >
                            {hour.label}
                          </span>
                        ))}
                      </span>
                    </div>
                    <ul className="grid gap-2">
                      {lanes.lanes.map((lane) => (
                        <li
                          key={lane.key}
                          className="grid grid-cols-[9rem_minmax(0,1fr)] items-center gap-2"
                        >
                          <span className="truncate text-sm font-semibold">
                            {lane.own
                              ? calendar('you')
                              : (lane.trainer?.name ?? calendar('noTrainer', { ...trainerWord }))}
                          </span>
                          <ul
                            className="relative rounded-md bg-muted/50"
                            style={{
                              height: lane.rows * BLOCK_PX + (lane.rows - 1) * ROW_GAP_PX,
                              backgroundImage:
                                'linear-gradient(to right, var(--border) 1px, transparent 1px)',
                              backgroundSize: `${100 / (lanes.endHour - lanes.firstHour)}% 100%`,
                            }}
                          >
                            {lane.blocks.map(({ item, left, width, row }) => {
                              const shown = item as Shown;
                              const cancelled = shown.status === 'cancelled';
                              return (
                                <li
                                  key={shown.id}
                                  className="absolute"
                                  style={{
                                    left: `${left}%`,
                                    width: `calc(${width}% - 3px)`,
                                    top: row * (BLOCK_PX + ROW_GAP_PX),
                                    height: BLOCK_PX,
                                  }}
                                >
                                  <Link
                                    href={href(shown)}
                                    aria-label={spoken(shown)}
                                    className={sessionBlockVariants({
                                      tone: cancelled ? 'cancelled' : shown.type,
                                    })}
                                  >
                                    <span
                                      className={`truncate font-semibold ${cancelled ? 'line-through' : ''}`}
                                    >
                                      {nameOf(shown)}
                                    </span>
                                    <span className="truncate">{detail(shown)}</span>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              </Card>
            ) : null}
          </>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card className="min-w-0 shadow-xs [--card-spacing:--spacing(5)]">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                <h2>{t('attentionTitle')}</h2>
              </CardTitle>
            </CardHeader>
            <div className="px-(--card-spacing)">
              {attention.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('attentionNone')}</p>
              ) : (
                <ul className="grid gap-2">
                  {attention.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 text-sm">{attentionText(item)}</span>
                      <Button asChild variant="outline">
                        <Link
                          href={href(item)}
                          aria-label={t('assignLabel', { item: attentionText(item) })}
                        >
                          {t('assign')}
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {items.length > 0 ? (
            <Card className="min-w-0 shadow-xs [--card-spacing:--spacing(5)]">
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  <h2 id="still-today">{t('stillToday')}</h2>
                </CardTitle>
              </CardHeader>
              <div className="px-(--card-spacing)">
                {upcoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('noMoreToday')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" aria-labelledby="still-today">
                      <thead>
                        <tr className="border-b text-start">
                          <th scope="col" className="py-2 pe-3 text-start font-medium">
                            {t('columnTime')}
                          </th>
                          <th scope="col" className="py-2 pe-3 text-start font-medium">
                            {t('columnSession')}
                          </th>
                          <th scope="col" className="py-2 pe-3 text-start font-medium">
                            {calendar('columnTrainer', { ...trainerWord })}
                          </th>
                          <th scope="col" className="py-2 text-start font-medium">
                            {t('columnOccupancy')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {upcoming.map((item) => (
                          <tr key={item.id} className="border-b last:border-b-0">
                            <td className="py-2 pe-3 whitespace-nowrap tabular-nums">
                              {timeRange(item)}
                            </td>
                            <th scope="row" className="py-2 pe-3 text-start font-normal">
                              <Link
                                href={href(item)}
                                className="inline-flex min-h-6 items-center gap-2 font-medium underline-offset-4 hover:underline"
                              >
                                <span
                                  aria-hidden="true"
                                  className={`size-2.5 shrink-0 rounded-full ${item.type === 'private' ? 'bg-session-private-solid' : 'bg-session-group-solid'}`}
                                />
                                {nameOf(item)}
                              </Link>
                              {mixed ? (
                                <span className="ms-2 text-muted-foreground">{typeOf(item)}</span>
                              ) : null}
                            </th>
                            <td className="py-2 pe-3">{trainerOf(item)}</td>
                            <td className="py-2">
                              {item.type === 'group' ? (
                                <span className="flex items-center gap-2">
                                  <Bar
                                    share={item.capacity ? (item.booked ?? 0) / item.capacity : 0}
                                    tone="group"
                                  />
                                  <span className="tabular-nums">{booked(item)}</span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground">{item.location.name}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Card>
          ) : null}
        </div>

        <div>
          <Button asChild variant="outline">
            <Link href={`/w/${slug}/calendar` as Route}>{t('toCalendar')}</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

/** A thin bar for a share of a whole; the numbers next to it say the same in words. */
function Bar({ share, tone }: { share: number; tone: 'private' | 'group' }) {
  return (
    <span
      aria-hidden="true"
      className="block h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-muted"
    >
      <span
        className={`block h-full rounded-full ${tone === 'private' ? 'bg-session-private-solid' : 'bg-session-group-solid'}`}
        style={{ width: `${Math.min(Math.max(share, 0), 1) * 100}%` }}
      />
    </span>
  );
}

function Tile({
  label,
  value,
  note,
  share,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  share: number;
  tone: 'private' | 'group';
}) {
  return (
    <li className="grid gap-1 rounded-xl border bg-card p-4 shadow-xs">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="text-3xl leading-8 font-extrabold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{note}</span>
      <span className="mt-1 flex">
        <Bar share={share} tone={tone} />
      </span>
    </li>
  );
}
