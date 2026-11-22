'use client';

import type { Schemas } from '@fivvi/contract';
import {
  capOverlaps,
  clockChangeOn,
  layoutOverlaps,
  placeInDay,
  weekAxis,
  weekDates,
} from '@fivvi/domain/calendar-grid';
import { addDays } from '@fivvi/domain/zoned-time';
import type { TrainerWordForms } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import { sessionBlockVariants, WeekGrid, type WeekGridColumn } from '@fivvi/ui/kit/week-grid';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type DateTimeFormatOptions, useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { TimeZoneHint } from '../../../me/(personal)/time-zone-hint';
import { useOpenNewSession } from '../sessions/new-private-session';
import { useSessionFormat } from '../sessions/use-session-format';
import {
  DEFAULT_FILTERS,
  filterItems,
  filtersKey,
  NO_TRAINER,
  readFilters,
  type WorkspaceFilters,
  writeFilters,
} from './calendar-filters';
import { type CalendarAccess, type CalendarItem, QuickView } from './quick-view';

export type CalendarView = 'day' | 'week' | 'list';
type Shown = CalendarItem & { type: 'private' | 'group' };

const WIDE = '(min-width: 1024px)';
const subscribeToWidth = (onChange: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

/** Below 1024 px the list is the default view (WC-04); above it, the week. */
function useDefaultView(): CalendarView {
  const wide = useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
  return wide ? 'week' : 'list';
}

const MAX_SIDE_BY_SIDE = 3;
const pad = (hour: number) => String(hour).padStart(2, '0');

/**
 * *Agenda* / *Calendar* (`/w/{slug}/calendar`, F014 WC-02 to WC-05): the workspace's week of
 * `date` as `GET /v1/workspaces/{workspaceId}/calendar` answers it, in three views of the same
 * data: *Week* (the grid shared with *Mijn agenda*), *Dag* (a column per trainer) and *Lijst* (a
 * real table per day, the default below 1024 px). Every block starts with its type in words and
 * opens the quick view; colour only supports it (PRODUCT.md §48). *Trainers* and *Type* are
 * remembered in this browser, per account and workspace. Times are the workspace's wall clock;
 * the API decides the rest and this screen words it.
 */
export function WorkspaceCalendarView({
  calendar,
  date,
  today,
  initialView,
  trainers,
  slug,
  workspaceId,
  accountId,
  access,
  trainerWord,
}: {
  calendar: Schemas['WorkspaceCalendar'];
  /** The day the page is on: the week it holds is the one fetched. `YYYY-MM-DD`. */
  date: string;
  /** Today on the workspace's wall clock. */
  today: string;
  initialView?: CalendarView;
  /** The workspace's trainers: what *Trainers* lists and the columns of the day view. */
  trainers: readonly { id: string; name: string }[];
  slug: string;
  workspaceId: string;
  accountId: string;
  access: CalendarAccess;
  /** The workspace's word for the people who teach (F068), in the reader's language. */
  trainerWord: TrainerWordForms;
}) {
  const t = useTranslations('workspaceCalendar');
  const shared = useTranslations('myCalendar');
  const format = useFormatter();
  const router = useRouter();
  // PS-01 of the frame's + Nieuw; none for a person who may not plan private sessions.
  const openNewSession = useOpenNewSession();
  const defaultView = useDefaultView();
  const [chosen, setChosen] = useState<CalendarView | undefined>(initialView);
  const view = chosen ?? defaultView;
  const [filters, setFilters] = useState<WorkspaceFilters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const openQuickView = (item: CalendarItem) => {
    opener.current = document.activeElement as HTMLElement | null;
    setSelected(item);
  };
  const [now, setNow] = useState<Date>();
  const key = filtersKey(accountId, workspaceId);
  // What this browser remembers is read once the page is there; the server draws the default.
  useEffect(() => setFilters(readFilters(window.localStorage, key)), [key]);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const timeZone = calendar.timeZone;
  const when = useSessionFormat(timeZone);
  const days = weekDates(date);
  const axis = weekAxis(days, timeZone);
  const dayText = (day: string, style: DateTimeFormatOptions) =>
    format.dateTime(new Date(`${day}T12:00:00Z`), { timeZone: 'UTC', ...style });
  const weekRange = shared('range', {
    start: dayText(days[0] ?? date, { day: 'numeric', month: 'short' }),
    end: dayText(days[6] ?? date, { day: 'numeric', month: 'short', year: 'numeric' }),
  });
  const dayLabel = dayText(date, { weekday: 'long', day: 'numeric', month: 'long' });
  const step = view === 'day' ? 1 : 7;

  const dayOf = (item: CalendarItem) =>
    placeInDay(new Date(item.startsAt), new Date(item.endsAt), timeZone).date;
  const all = calendar.items.filter((item): item is Shown => item.type !== 'open_gym');
  const inRange = (items: Shown[]) =>
    view === 'day' ? items.filter((i) => dayOf(i) === date) : items;
  const unfiltered = inRange(all);
  const visible = inRange(filterItems(all, filters));

  function change(next: WorkspaceFilters) {
    setFilters(next);
    writeFilters(window.localStorage, key, next);
  }

  /** The address of the calendar on `to`, keeping the view the person chose. */
  function href(to: string): Route {
    const query = new URLSearchParams({ date: to });
    if (chosen) query.set('view', chosen);
    return `/w/${slug}/calendar?${query}` as Route;
  }

  function choose(next: CalendarView) {
    setChosen(next);
    const url = new URL(window.location.href);
    url.searchParams.set('view', next);
    window.history.replaceState(null, '', url);
  }

  // T, ← →, D, W, L and N, unless the person is typing or a dialog is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.metaKey || event.ctrlKey || event.altKey || selected) return;
      if (target.closest('input, textarea, select, [role="dialog"]')) return;
      const go = (to: string) => router.push(href(to));
      if (event.key === 't') go(today);
      else if (event.key === 'ArrowLeft') go(addDays(date, -step));
      else if (event.key === 'ArrowRight') go(addDays(date, step));
      else if (event.key === 'd') choose('day');
      else if (event.key === 'w') choose('week');
      else if (event.key === 'l') choose('list');
      else if (event.key === 'n') openNewSession?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const typeOf = (item: Shown) =>
    item.type === 'private' ? shared('typePrivate') : shared('typeGroup');
  const nameOf = (item: Shown) =>
    (item.type === 'private' ? item.clientName : item.className) ?? typeOf(item);
  const trainerOf = (item: Shown) =>
    item.trainer
      ? item.trainer.id === access.teamMemberId
        ? t('you')
        : item.trainer.name
      : undefined;

  /** "Groep · Kracht, dinsdag 22 september, 10:00 tot 11:00, Sarah, 7 van 8 geboekt": the block as one phrase. */
  function spoken(item: Shown) {
    return [
      shared('block', { type: typeOf(item), name: nameOf(item) }),
      dayText(dayOf(item), { weekday: 'long', day: 'numeric', month: 'long' }),
      shared('spokenTime', { start: when.time(item.startsAt), end: when.time(item.endsAt) }),
      trainerOf(item) ?? t('noTrainerMark', { ...trainerWord }),
      item.type === 'group'
        ? t('spokenBooked', { booked: item.booked ?? 0, capacity: item.capacity })
        : undefined,
      item.status === 'cancelled' ? shared('cancelled') : undefined,
    ]
      .filter((part): part is string => Boolean(part))
      .reduce((first, next) => shared('spokenJoin', { first, next }));
  }

  function block(item: Shown) {
    const cancelled = item.status === 'cancelled';
    return (
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={spoken(item)}
        onClick={() => openQuickView(item)}
        className={sessionBlockVariants({ tone: cancelled ? 'cancelled' : item.type })}
      >
        <span className={`truncate font-semibold ${cancelled ? 'line-through' : ''}`}>
          {shared('block', { type: typeOf(item), name: nameOf(item) })}
        </span>
        <span className="truncate">
          {trainerOf(item) ?? t('noTrainerMark', { ...trainerWord })}
          {item.type === 'group'
            ? ` · ${shared('blockBooked', { booked: item.booked ?? 0, capacity: item.capacity })}`
            : null}
        </span>
        {cancelled ? <span className="truncate">{shared('cancelled')}</span> : null}
      </button>
    );
  }

  /** The columns of the grid: the seven days, or in the day view a column per trainer. */
  function grid(): { columns: WeekGridColumn[]; firstHour: number; endHour: number } {
    const cells =
      view === 'day'
        ? [
            ...trainers
              .filter(({ id }) => !filters.hiddenTrainerIds.includes(id))
              .map(({ id, name }) => ({
                key: id,
                header: id === access.teamMemberId ? t('you') : name,
                day: date,
                items: visible.filter((item) => item.trainer?.id === id),
              })),
            ...(visible.some((item) => !item.trainer)
              ? [
                  {
                    key: NO_TRAINER,
                    header: t('noTrainer', { ...trainerWord }),
                    day: date,
                    items: visible.filter((item) => !item.trainer),
                  },
                ]
              : []),
          ]
        : days.map((day) => ({
            key: day,
            header: null,
            day,
            items: visible.filter((item) => dayOf(item) === day),
          }));
    const placed = cells.map((cell) => ({
      ...cell,
      ...capOverlaps(
        layoutOverlaps(
          cell.items.map((item) => ({
            item,
            startMinute: axis.minute(cell.day, new Date(item.startsAt)),
            endMinute: axis.minute(cell.day, new Date(item.endsAt)),
          })),
        ),
        MAX_SIDE_BY_SIDE,
      ),
    }));
    const every = placed.flatMap((cell) => [...cell.shown, ...cell.more]);
    // 06:00–22:00 by the clock, grown to fit the week; the clock change moves the grid hours.
    const shift = (axis.totalMinutes - 1440) / 60;
    return {
      firstHour: Math.min(6 + shift, ...every.map((entry) => Math.floor(entry.startMinute / 60))),
      endHour: Math.max(22 + shift, ...every.map((entry) => Math.ceil(entry.endMinute / 60))),
      columns: placed.map((cell) => ({
        key: cell.key,
        header: cell.header ?? dayHeader(cell.day),
        today: cell.day === today && view !== 'day',
        ...(cell.day === today && now && view === 'week'
          ? { nowMinute: axis.minute(today, now) }
          : {}),
        blocks: [
          ...cell.shown.map(({ item, startMinute, endMinute, lane, lanes }) => ({
            key: item.id,
            startMinute,
            endMinute,
            lane,
            lanes,
            children: block(item),
          })),
          ...cell.more.map((more) => ({
            key: `more-${more.startMinute}`,
            startMinute: more.startMinute,
            endMinute: more.endMinute,
            lane: more.lane,
            lanes: more.lanes,
            children: (
              <Link
                href={
                  `/w/${slug}/calendar?${new URLSearchParams({ date: cell.day, view: 'day' })}` as Route
                }
                aria-label={t('moreHint', { count: more.count })}
                className="flex size-full items-center justify-center rounded-md border text-xs font-medium"
              >
                {t('more', { count: more.count })}
              </Link>
            ),
          })),
        ],
      })),
    };
  }

  /**
   * The mark `◐` of a day the clocks change, with its note in the tooltip and for screen readers;
   * in the list, where there is room, the note is text.
   */
  function clockMark(day: string, visible = false) {
    const kind = clockChangeOn(day, timeZone);
    if (!kind) return null;
    const note = shared(kind === 'back' ? 'clockBack' : 'clockForward');
    if (visible) {
      return (
        <span className="ms-2 text-xs font-normal normal-case">
          <span aria-hidden="true">◐ </span>
          {note}
        </span>
      );
    }
    return (
      <span title={note} className="ms-1">
        <span aria-hidden="true">◐</span>
        <span className="sr-only">{note}</span>
      </span>
    );
  }

  function dayHeader(day: string) {
    return (
      <span>
        {dayText(day, { weekday: 'short', day: 'numeric' })}
        {clockMark(day)}
      </span>
    );
  }

  const layout = view === 'list' ? undefined : grid();
  const empty = visible.length === 0 ? (unfiltered.length > 0 ? 'filtered' : 'nothing') : undefined;
  const toggle = <V extends string>(list: readonly V[], value: V, on: boolean): V[] =>
    on
      ? list.filter((entry) => entry !== value)
      : [...list.filter((entry) => entry !== value), value];
  const box = (id: string, label: string, checked: boolean, set: (on: boolean) => void) => (
    <label key={id} className="flex min-h-11 items-center gap-2 text-sm md:min-h-8">
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={checked}
        onChange={(event) => set(event.target.checked)}
      />
      {label}
    </label>
  );
  const chevron = (path: string) => (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );

  return (
    <main className="flex-1 px-4 pt-5 pb-10 md:px-6">
      <div className="grid max-w-275 content-start gap-4">
        <header className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
          <TimeZoneHint zone={timeZone} />
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={href(today)}>{shared('today')}</Link>
          </Button>
          <Button variant="outline" size="icon" asChild>
            <Link href={href(addDays(date, -step))} aria-label={shared('previous')}>
              {chevron('M10 3L5 8l5 5')}
            </Link>
          </Button>
          <Button variant="outline" size="icon" asChild>
            <Link href={href(addDays(date, step))} aria-label={shared('next')}>
              {chevron('M6 3l5 5-5 5')}
            </Link>
          </Button>
          <h2 className="min-w-0 flex-1 text-base font-semibold">
            {view === 'day' ? dayLabel : weekRange}
            {view === 'day' ? clockMark(date, true) : null}
          </h2>
          <fieldset className="flex gap-1" aria-label={shared('views')}>
            {(['day', 'week', 'list'] as const).map((option) => (
              <Button
                key={option}
                type="button"
                variant={view === option ? 'secondary' : 'ghost'}
                aria-pressed={view === option}
                onClick={() => choose(option)}
              >
                {shared(option === 'day' ? 'viewDay' : option === 'week' ? 'viewWeek' : 'viewList')}
              </Button>
            ))}
          </fieldset>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <fieldset className="flex flex-wrap items-center gap-x-4">
              <legend className="sr-only">{t('filterTrainers', { ...trainerWord })}</legend>
              <span aria-hidden="true" className="text-sm font-medium">
                {t('filterTrainers', { ...trainerWord })}
              </span>
              {[...trainers, { id: NO_TRAINER, name: t('noTrainer', { ...trainerWord }) }].map(
                ({ id, name }) =>
                  box(
                    id,
                    id === access.teamMemberId ? t('you') : name,
                    !filters.hiddenTrainerIds.includes(id),
                    (on) =>
                      change({
                        ...filters,
                        hiddenTrainerIds: toggle(filters.hiddenTrainerIds, id, on),
                      }),
                  ),
              )}
            </fieldset>
            <fieldset className="flex flex-wrap items-center gap-x-4">
              <legend className="sr-only">{shared('filterType')}</legend>
              <span aria-hidden="true" className="text-sm font-medium">
                {shared('filterType')}
              </span>
              {box(
                'private',
                shared('optionPrivate'),
                !filters.hiddenTypes.includes('private'),
                (on) =>
                  change({ ...filters, hiddenTypes: toggle(filters.hiddenTypes, 'private', on) }),
              )}
              {box('group', shared('optionGroup'), !filters.hiddenTypes.includes('group'), (on) =>
                change({ ...filters, hiddenTypes: toggle(filters.hiddenTypes, 'group', on) }),
              )}
              {box('cancelled', shared('showCancelled'), filters.showCancelled, (on) =>
                change({ ...filters, showCancelled: on }),
              )}
            </fieldset>
          </div>
          <ul aria-label={shared('legend')} className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {(['private', 'group'] as const).map((type) => (
              <li key={type} className="flex items-center gap-1.5 text-sm">
                <span
                  aria-hidden="true"
                  className={`size-3 rounded-xs ${type === 'private' ? 'bg-session-private-solid' : 'bg-session-group-solid'}`}
                />
                {type === 'private' ? shared('typePrivate') : shared('typeGroup')}
              </li>
            ))}
            <li className="text-sm">{t('legendScheduled')}</li>
            <li className="text-sm line-through">{shared('cancelled')}</li>
            <li className="text-sm">{t('noTrainerMark', { ...trainerWord })}</li>
          </ul>
        </div>
        <details className="text-sm text-muted-foreground">
          <summary className="min-h-11 cursor-pointer md:min-h-0">{t('shortcuts')}</summary>
          <p>{t('shortcutList')}</p>
        </details>

        {empty === 'filtered' ? (
          <div className="grid justify-items-start gap-2">
            <p>{shared('noResults')}</p>
            <Button type="button" variant="outline" onClick={() => change(DEFAULT_FILTERS)}>
              {shared('clearFilters')}
            </Button>
          </div>
        ) : null}
        {empty === 'nothing' ? (
          <div className="grid justify-items-start gap-2">
            <p>{view === 'day' ? t('emptyDay') : t('emptyWeek')}</p>
            {openNewSession ? (
              <Button type="button" variant="outline" onClick={openNewSession}>
                {t('newPrivate')}
              </Button>
            ) : null}
          </div>
        ) : null}

        {layout && !empty ? (
          <WeekGrid
            label={
              view === 'day'
                ? shared('gridDay', { date: dayLabel })
                : shared('gridWeek', { range: weekRange })
            }
            columns={layout.columns}
            firstHour={layout.firstHour}
            endHour={layout.endHour}
            hourLabel={(hour) => `${pad(axis.labelHour(hour))}:00`}
            {...(view === 'day' && layout.columns.length > 5 ? { minColumnRem: 8 } : {})}
          />
        ) : null}

        {view === 'list' && !empty ? (
          <div className="grid gap-4">
            {days
              .filter((day) => visible.some((item) => dayOf(item) === day))
              .map((day) => (
                <section
                  key={day}
                  aria-labelledby={`day-${day}`}
                  className="overflow-x-auto rounded-xl border bg-card"
                >
                  <h3
                    id={`day-${day}`}
                    className="border-b px-3 py-2 text-sm font-semibold uppercase"
                  >
                    {dayText(day, { weekday: 'long', day: 'numeric', month: 'long' })}
                    {day === today ? ` · ${t('todayMark')}` : null}
                    {clockMark(day, true)}
                  </h3>
                  <table className="w-full text-sm">
                    <caption className="sr-only">
                      {shared('listCaption', {
                        range: dayText(day, { weekday: 'long', day: 'numeric', month: 'long' }),
                      })}
                    </caption>
                    <thead>
                      <tr className="border-b text-start">
                        {(
                          [
                            'columnTime',
                            'columnType',
                            'columnSession',
                            'columnTrainer',
                            'columnLocation',
                            'columnStatus',
                          ] as const
                        ).map((column) => (
                          <th key={column} scope="col" className="px-3 py-2 text-start font-medium">
                            {column === 'columnTrainer' || column === 'columnLocation'
                              ? t(column, { ...trainerWord })
                              : shared(column)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visible
                        .filter((item) => dayOf(item) === day)
                        .map((item) => {
                          const cancelled = item.status === 'cancelled';
                          return (
                            <tr key={item.id} className="border-b last:border-b-0">
                              <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                                {shared('timeRange', {
                                  start: when.time(item.startsAt),
                                  end: when.time(item.endsAt),
                                })}
                              </td>
                              <td className="px-3 py-2">
                                {item.type === 'private'
                                  ? t('typePrivateSession')
                                  : t('typeGroupClass')}
                              </td>
                              <th scope="row" className="px-3 py-2 text-start font-medium">
                                <button
                                  type="button"
                                  aria-haspopup="dialog"
                                  onClick={() => openQuickView(item)}
                                  className={`inline-flex min-h-11 items-center underline-offset-4 hover:underline md:min-h-0 ${cancelled ? 'line-through' : ''}`}
                                >
                                  {nameOf(item)}
                                </button>
                              </th>
                              <td className="px-3 py-2">
                                {trainerOf(item) ?? t('noTrainerMark', { ...trainerWord })}
                              </td>
                              <td className="px-3 py-2">{item.location.name}</td>
                              <td className="px-3 py-2">
                                {cancelled
                                  ? shared('cancelled')
                                  : item.type === 'group'
                                    ? shared('blockBooked', {
                                        booked: item.booked ?? 0,
                                        capacity: item.capacity,
                                      })
                                    : null}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </section>
              ))}
          </div>
        ) : null}
      </div>
      <QuickView
        item={selected}
        slug={slug}
        access={access}
        trainerWord={trainerWord}
        onClose={() => setSelected(null)}
        returnFocus={() => opener.current?.focus()}
      />
    </main>
  );
}
