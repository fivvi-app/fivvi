'use client';

import type { Schemas } from '@fivvi/contract';
import {
  type CalendarFilters,
  clockChangeOn,
  filterCalendarItems,
  layoutOverlaps,
  placeInDay,
  weekDates,
} from '@fivvi/domain/calendar-grid';
import { addDays } from '@fivvi/domain/zoned-time';
import { Button } from '@fivvi/ui/components/button';
import { sessionBlockVariants, WeekGrid, type WeekGridColumn } from '@fivvi/ui/kit/week-grid';
import type { Route } from 'next';
import Link from 'next/link';
import { type DateTimeFormatOptions, useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState, useSyncExternalStore } from 'react';
import { useSessionFormat } from '../../../w/[slug]/sessions/use-session-format';
import { TimeZoneHint } from '../time-zone-hint';
import { DEFAULT_FILTERS, readFilters, writeFilters } from './calendar-filters';

type Item = Schemas['PersonalSession'];
export type CalendarView = 'day' | 'week' | 'list';

/** A session of the personal calendar as it is drawn: Open Gym comes later, so it is never one of these. */
type ShownItem = Item & { type: 'private' | 'group' };

const WIDE = '(min-width: 1024px)';
const subscribeToWidth = (onChange: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

/** Below 1024 px the list is the default view (F013); above it, the week. */
function useDefaultView(): CalendarView {
  const wide = useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
  return wide ? 'week' : 'list';
}

/**
 * *Mijn agenda* / *My calendar* (`/me/calendar`, F013): the week of `date` of the signed-in
 * trainer across all their workspaces, as `GET /v1/me/sessions` answers it, in three views of the
 * same data: *Dag* (a column per workspace when there are several), *Week* (the grid shared with
 * the workspace calendar) and *Lijst* (a real table). Below 1024 px the list is the default.
 * Every block, row and legend entry names its type in words; colour only supports it (PRODUCT.md
 * §48). Filters by type and workspace are remembered in this browser; the cancelled stay unless
 * switched off. Times are Dutch time, the only zone of the personal scope.
 */
export function MyCalendarView({
  calendar,
  date,
  today,
  initialView,
  workspaces,
}: {
  calendar: Schemas['MySessions'];
  /** The day the page is on: the week it holds is the one fetched. `YYYY-MM-DD`. */
  date: string;
  /** Today in Dutch time. */
  today: string;
  /** The view asked for in the address; none until the person chooses, then the screen decides. */
  initialView?: CalendarView;
  /** The workspaces the person trains in, by name: what the *Werkruimte* filter lists. */
  workspaces: readonly { id: string; name: string }[];
}) {
  const t = useTranslations('myCalendar');
  const format = useFormatter();
  const defaultView = useDefaultView();
  const [chosen, setChosen] = useState<CalendarView | undefined>(initialView);
  const view = chosen ?? defaultView;
  const [filters, setFilters] = useState<CalendarFilters>(DEFAULT_FILTERS);
  // The filters of this browser are read once the page is there; the server draws the default.
  useEffect(() => setFilters(readFilters(window.localStorage)), []);
  const timeZone = calendar.timeZone;
  const when = useSessionFormat(timeZone);
  const several = calendar.workspaceCount > 1;

  const items = calendar.items.filter((item): item is ShownItem => item.type !== 'open_gym');
  const shown = filterCalendarItems(items, filters);
  const days = weekDates(date);
  const dayText = (day: string, style: DateTimeFormatOptions) =>
    format.dateTime(new Date(`${day}T12:00:00Z`), { timeZone: 'UTC', ...style });
  const weekRange = t('range', {
    start: dayText(days[0] ?? date, { day: 'numeric', month: 'short' }),
    end: dayText(days[6] ?? date, { day: 'numeric', month: 'short', year: 'numeric' }),
  });
  const dayLabel = dayText(date, { weekday: 'long', day: 'numeric', month: 'long' });
  const heading = view === 'day' ? dayLabel : weekRange;

  function change(next: CalendarFilters) {
    setFilters(next);
    writeFilters(window.localStorage, next);
  }

  function choose(next: CalendarView) {
    setChosen(next);
    const url = new URL(window.location.href);
    url.searchParams.set('view', next);
    window.history.replaceState(null, '', url);
  }

  /** The address of the calendar on `to`, keeping the view the person chose. */
  function href(to: string): Route {
    const query = new URLSearchParams({ date: to });
    if (chosen) query.set('view', chosen);
    return `/me/calendar?${query}` as Route;
  }
  const step = view === 'day' ? 1 : 7;

  const inView = view === 'day' ? shown.filter((item) => dayOf(item) === date) : shown;
  const unfilteredInView = view === 'day' ? items.filter((item) => dayOf(item) === date) : items;

  function dayOf(item: Item) {
    return placeInDay(new Date(item.startsAt), new Date(item.endsAt), timeZone).date;
  }

  function typeOf(item: ShownItem) {
    return item.type === 'private' ? t('typePrivate') : t('typeGroup');
  }

  function nameOf(item: ShownItem) {
    return (item.type === 'private' ? item.clientName : item.className) ?? typeOf(item);
  }

  /** F024: "Je valt in voor Sarah" for the substitute, "Overgenomen door Mike" for the trainer replaced. */
  function substitution(item: ShownItem) {
    if (item.substituteFor) return t('coveringFor', { name: item.substituteFor.name });
    if (item.takenOverBy) return t('takenOverBy', { name: item.takenOverBy.name });
    return undefined;
  }

  /** "Privé · Anna, 09:00 tot 10:00, John's Gym, Geannuleerd": the block as one phrase, starting with the type. */
  function spoken(item: ShownItem) {
    const parts = [
      t('block', { type: typeOf(item), name: nameOf(item) }),
      t('spokenTime', { start: when.time(item.startsAt), end: when.time(item.endsAt) }),
      several ? item.workspace.name : undefined,
      substitution(item),
      item.status === 'cancelled' ? t('cancelled') : undefined,
    ].filter((part): part is string => Boolean(part));
    return parts.reduce((first, next) => t('spokenJoin', { first, next }));
  }

  function sessionHref(item: Item) {
    return `/w/${item.workspace.slug}/sessions/${item.sessionId}` as Route;
  }

  function block(item: ShownItem) {
    const cancelled = item.status === 'cancelled';
    return (
      <Link
        href={sessionHref(item)}
        aria-label={spoken(item)}
        className={sessionBlockVariants({
          tone: cancelled ? 'cancelled' : item.takenOverBy ? 'dimmed' : item.type,
        })}
      >
        <span className={`truncate font-semibold ${cancelled ? 'line-through' : ''}`}>
          {t('block', { type: typeOf(item), name: nameOf(item) })}
        </span>
        {item.type === 'group' ? (
          <span className="truncate">
            {t('blockBooked', { booked: item.booked ?? 0, capacity: item.capacity })}
          </span>
        ) : null}
        {several ? <span className="truncate">{item.workspace.name}</span> : null}
        {substitution(item) ? <span className="truncate">{substitution(item)}</span> : null}
        {cancelled ? <span className="truncate">{t('cancelled')}</span> : null}
      </Link>
    );
  }

  /** The columns of the grid: the seven days, or in the day view a column per workspace. */
  function columns(): { columns: WeekGridColumn[]; firstHour: number; endHour: number } {
    const cells: { key: string; header: ReactNode; today: boolean; items: ShownItem[] }[] =
      view === 'day'
        ? several
          ? workspaces
              .filter(({ id }) => !filters.hiddenWorkspaceIds.includes(id))
              .map((workspace) => ({
                key: workspace.id,
                header: workspace.name,
                today: false,
                items: inView.filter((item) => item.workspace.id === workspace.id),
              }))
          : [{ key: date, header: dayHeader(date), today: date === today, items: inView }]
        : days.map((day) => ({
            key: day,
            header: dayHeader(day),
            today: day === today,
            items: inView.filter((item) => dayOf(item) === day),
          }));
    const placed = cells.map((cell) => ({
      ...cell,
      blocks: layoutOverlaps(
        cell.items.map((item) => ({
          item,
          ...placeInDay(new Date(item.startsAt), new Date(item.endsAt), timeZone),
        })),
      ),
    }));
    const all = placed.flatMap(({ blocks }) => blocks);
    const firstHour = Math.min(7, ...all.map((entry) => Math.floor(entry.startMinute / 60)));
    const endHour = Math.max(22, ...all.map((entry) => Math.ceil(entry.endMinute / 60)));
    return {
      firstHour,
      endHour,
      columns: placed.map((cell) => ({
        key: cell.key,
        header: cell.header,
        today: cell.today,
        blocks: cell.blocks.map(({ item, startMinute, endMinute, lane, lanes }) => ({
          key: item.sessionId,
          startMinute,
          endMinute,
          lane,
          lanes,
          children: block(item),
        })),
      })),
    };
  }

  /** The note of a day the clocks change, or none: *Wintertijd: de klok gaat 1 uur terug*. */
  function clockNote(day: string) {
    const kind = clockChangeOn(day, timeZone);
    return kind ? t(kind === 'back' ? 'clockBack' : 'clockForward') : undefined;
  }

  /**
   * The mark `◐` of a day the clocks change. In a tight header it comes with the note in the
   * tooltip and for screen readers; where there is room (the heading, a list row) the note is
   * text, since a tooltip does not show on a touch screen.
   */
  function clockMark(day: string, visible = false) {
    const note = clockNote(day);
    if (!note) return null;
    if (visible) {
      return (
        <span className="mt-0.5 flex items-start gap-1 text-xs font-normal whitespace-normal text-muted-foreground">
          <span aria-hidden="true">◐</span>
          <span>{note}</span>
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

  /** A day's header: its short name and number, and on a day the clocks change the mark with its note. */
  function dayHeader(day: string) {
    return (
      <span>
        {dayText(day, { weekday: 'short', day: 'numeric' })}
        {clockMark(day)}
      </span>
    );
  }

  const grid = view === 'list' ? undefined : columns();
  const empty =
    inView.length === 0 ? (unfilteredInView.length > 0 ? 'filtered' : 'nothing') : undefined;

  return (
    <main className="flex-1 px-4 pt-5 pb-10 md:px-6">
      <div className="grid max-w-275 content-start gap-4">
        <header className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
          <TimeZoneHint zone={timeZone} />
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={href(today)}>{t('today')}</Link>
          </Button>
          <Button variant="outline" size="icon" asChild>
            <Link href={href(addDays(date, -step))} aria-label={t('previous')}>
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 3L5 8l5 5" />
              </svg>
            </Link>
          </Button>
          <Button variant="outline" size="icon" asChild>
            <Link href={href(addDays(date, step))} aria-label={t('next')}>
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 3l5 5-5 5" />
              </svg>
            </Link>
          </Button>
          <h2 className="min-w-0 flex-1 text-base font-semibold">
            {heading}
            {/* The columns of the day view are workspaces, so the mark goes in the heading. */}
            {view === 'day' && several ? clockMark(date, true) : null}
          </h2>
          <fieldset className="flex gap-1" aria-label={t('views')}>
            {(['day', 'week', 'list'] as const).map((option) => (
              <Button
                key={option}
                type="button"
                variant={view === option ? 'secondary' : 'ghost'}
                aria-pressed={view === option}
                onClick={() => choose(option)}
              >
                {t(option === 'day' ? 'viewDay' : option === 'week' ? 'viewWeek' : 'viewList')}
              </Button>
            ))}
          </fieldset>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <FilterBar filters={filters} workspaces={several ? workspaces : []} onChange={change} />
          <ul aria-label={t('legend')} className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {(['private', 'group'] as const).map((type) => (
              <li key={type} className="flex items-center gap-1.5 text-sm">
                <span
                  aria-hidden="true"
                  className={`size-3 rounded-xs ${type === 'private' ? 'bg-session-private-solid' : 'bg-session-group-solid'}`}
                />
                {type === 'private' ? t('typePrivate') : t('typeGroup')}
              </li>
            ))}
          </ul>
        </div>

        {empty === 'filtered' ? (
          <div className="grid justify-items-start gap-2">
            <p>{t('noResults')}</p>
            <Button type="button" variant="outline" onClick={() => change(DEFAULT_FILTERS)}>
              {t('clearFilters')}
            </Button>
          </div>
        ) : null}
        {empty === 'nothing' ? <p>{view === 'day' ? t('emptyDay') : t('emptyWeek')}</p> : null}

        {grid && !empty ? (
          <WeekGrid
            label={
              view === 'day'
                ? t('gridDay', { date: dayLabel })
                : t('gridWeek', { range: weekRange })
            }
            columns={grid.columns}
            firstHour={grid.firstHour}
            endHour={grid.endHour}
            hourLabel={(hour) => `${String(hour).padStart(2, '0')}:00`}
          />
        ) : null}

        {view === 'list' && !empty ? (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('listCaption', { range: weekRange })}</caption>
              <thead>
                <tr className="border-b text-start">
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    {t('columnDay')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    {t('columnTime')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    {t('columnSession')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    {t('columnType')}
                  </th>
                  {several ? (
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      {t('columnWorkspace')}
                    </th>
                  ) : null}
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    {t('columnStatus')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {inView.map((item) => {
                  const cancelled = item.status === 'cancelled';
                  return (
                    <tr key={item.sessionId} className="border-b last:border-b-0">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {dayText(dayOf(item), { weekday: 'short', day: 'numeric', month: 'short' })}
                        {clockMark(dayOf(item), true)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        {t('timeRange', {
                          start: when.time(item.startsAt),
                          end: when.time(item.endsAt),
                        })}
                      </td>
                      <th scope="row" className="px-3 py-2 text-start font-medium">
                        <Link
                          href={sessionHref(item)}
                          className={`inline-flex min-h-11 items-center underline-offset-4 hover:underline md:min-h-0 ${cancelled ? 'line-through' : ''}${item.takenOverBy ? ' text-muted-foreground' : ''}`}
                        >
                          {nameOf(item)}
                        </Link>
                      </th>
                      <td className="px-3 py-2">{typeOf(item)}</td>
                      {several ? <td className="px-3 py-2">{item.workspace.name}</td> : null}
                      <td className="px-3 py-2">
                        {cancelled ? t('cancelled') : (substitution(item) ?? null)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </main>
  );
}

/** *Type* and *Werkruimte*: what is switched off, so a workspace that is new is shown. */
function FilterBar({
  filters,
  workspaces,
  onChange,
}: {
  filters: CalendarFilters;
  /** The workspaces to filter by; none to leave the filter out (one workspace). */
  workspaces: readonly { id: string; name: string }[];
  onChange: (filters: CalendarFilters) => void;
}) {
  const t = useTranslations('myCalendar');
  const toggle = <V extends string>(list: readonly V[], value: V, on: boolean): V[] =>
    on ? list.filter((item) => item !== value) : [...list.filter((item) => item !== value), value];
  const box = (key: string, label: string, checked: boolean, set: (on: boolean) => void) => (
    <label key={key} className="flex min-h-11 items-center gap-2 text-sm md:min-h-8">
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={checked}
        onChange={(event) => set(event.target.checked)}
      />
      {label}
    </label>
  );
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1">
      <fieldset className="flex flex-wrap items-center gap-x-4">
        <legend className="sr-only">{t('filterType')}</legend>
        <span aria-hidden="true" className="text-sm font-medium">
          {t('filterType')}
        </span>
        {box('private', t('optionPrivate'), !filters.hiddenTypes.includes('private'), (on) =>
          onChange({ ...filters, hiddenTypes: toggle(filters.hiddenTypes, 'private', on) }),
        )}
        {box('group', t('optionGroup'), !filters.hiddenTypes.includes('group'), (on) =>
          onChange({ ...filters, hiddenTypes: toggle(filters.hiddenTypes, 'group', on) }),
        )}
        {box('cancelled', t('showCancelled'), filters.showCancelled, (on) =>
          onChange({ ...filters, showCancelled: on }),
        )}
      </fieldset>
      {workspaces.length > 0 ? (
        <fieldset className="flex flex-wrap items-center gap-x-4">
          <legend className="sr-only">{t('filterWorkspace')}</legend>
          <span aria-hidden="true" className="text-sm font-medium">
            {t('filterWorkspace')}
          </span>
          {workspaces.map((workspace) =>
            box(
              workspace.id,
              workspace.name,
              !filters.hiddenWorkspaceIds.includes(workspace.id),
              (on) =>
                onChange({
                  ...filters,
                  hiddenWorkspaceIds: toggle(filters.hiddenWorkspaceIds, workspace.id, on),
                }),
            ),
          )}
        </fieldset>
      ) : null}
    </div>
  );
}
