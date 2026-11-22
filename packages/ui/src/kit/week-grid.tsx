'use client';

import { cn } from 'cn';
import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

/** The height of one hour in the grid, in px: 48 px with a 15-minute grid, as WC-02 draws it. */
const HOUR_PX = 48;
const MINUTE_PX = HOUR_PX / 60;
/** A block never gets lower than this, so a short session stays readable and clickable. */
const MIN_BLOCK_PX = 22;

/** A block in a day column: its minutes from midnight, its lane among the blocks it overlaps and what it shows. */
export interface WeekGridBlock {
  key: string;
  startMinute: number;
  endMinute: number;
  /** 0-based, from `layoutOverlaps` of `@fivvi/domain/calendar-grid`. */
  lane: number;
  lanes: number;
  /** The block's face: a link styled with `sessionBlockVariants`, filling the block. */
  children: ReactNode;
  /** The block can be dragged to another time (`onMoveBlock`, WC-07). */
  movable?: boolean;
}

/** A click or a drag on an empty moment of a column (WC-06): minutes from midnight, on the grid. */
export interface WeekGridSlot {
  columnKey: string;
  /** Snapped down to the grid step. */
  startMinute: number;
  /** After a drag, snapped up; after a click, one step after the start. */
  endMinute: number;
  /** The selection was made by dragging, not by a click. */
  dragged: boolean;
}

/** A block dropped on a place of the grid (WC-07): the column and the snapped start minute. */
export interface WeekGridMove {
  blockKey: string;
  fromColumnKey: string;
  columnKey: string;
  startMinute: number;
}

/** The pointer must travel this far before a press on a block is a drag and not a click. */
const DRAG_THRESHOLD_PX = 5;

type Selecting = { columnKey: string; anchor: number; current: number };
type Dragging = {
  blockKey: string;
  fromColumnKey: string;
  duration: number;
  /** Where the pointer holds the block, in minutes from its start. */
  grab: number;
  /** The place the block would land on; none while the pointer is over nothing it may land on. */
  target: { columnKey: string; startMinute: number } | null;
};

export interface WeekGridColumn {
  key: string;
  /** The column's header: a day, or a workspace in the day view. */
  header: ReactNode;
  /** Today's column is tinted. */
  today?: boolean;
  /** The minute of the now-line, in grid minutes from the start of the day; none for a column that is not today. */
  nowMinute?: number;
  blocks: readonly WeekGridBlock[];
}

/**
 * The time grid of a calendar (F013 *Mijn agenda*, F014's WC-02): columns for days (or, in the
 * day view, for resources such as workspaces), one row per hour from `firstHour` up to `endHour`,
 * and blocks placed by their minutes, side by side where they overlap. It carries no text and
 * decides no rule: the caller names the columns, lays the blocks out and words the hour marks.
 * Wider than its container it scrolls inside it, so the page never scrolls sideways.
 */
export function WeekGrid({
  columns,
  firstHour,
  endHour,
  hourLabel,
  label,
  minColumnRem,
  snapMinutes = 15,
  onSelectSlot,
  onMoveBlock,
  placeLabel,
  acceptsDrop,
  className,
}: {
  columns: readonly WeekGridColumn[];
  /** The first hour shown, 0–23. */
  firstHour: number;
  /** The hour the grid ends at (not shown as a row), 1–24. */
  endHour: number;
  /** The mark of an hour, e.g. `09:00`. */
  hourLabel: (hour: number) => string;
  /** What screen readers call the grid. */
  label: string;
  /** A column never gets narrower than this, in rem: more columns than fit scroll inside the grid (WC-03: more than 5). */
  minColumnRem?: number;
  /** The grid step a click or a drop snaps to, in minutes (WC-02: 15). */
  snapMinutes?: number;
  /** A click or a drag on an empty moment (WC-06). Without it the columns are not interactive. */
  onSelectSlot?: (slot: WeekGridSlot) => void;
  /** A movable block dropped on another place (WC-07). Without it no block can be dragged. */
  onMoveBlock?: (move: WeekGridMove) => void;
  /**
   * The mark shown while dragging for the place the block would land on, e.g. `08:00`; `undefined`
   * where the grid holds no time (a skipped hour), which is no place to land on. Without it every
   * place is one to land on and no mark is shown.
   */
  placeLabel?: (columnKey: string, minute: number) => string | undefined;
  /** Whether a block may land in another column than its own; without it every column does. */
  acceptsDrop?: (blockKey: string, fromColumnKey: string, columnKey: string) => boolean;
  className?: string;
}) {
  const hours = Array.from({ length: endHour - firstHour }, (_, index) => firstHour + index);
  const template = {
    gridTemplateColumns: `3.25rem repeat(${columns.length}, minmax(0, 1fr))`,
  } satisfies CSSProperties;

  const bodies = useRef(new Map<string, HTMLDivElement>());
  const [selecting, setSelecting] = useState<Selecting | null>(null);
  const [dragging, setDragging] = useState<Dragging | null>(null);
  // The latest props for the listeners on the window, which outlive a render.
  const live = useRef({
    firstHour,
    endHour,
    snapMinutes,
    onSelectSlot,
    onMoveBlock,
    placeLabel,
    acceptsDrop,
  });
  live.current = {
    firstHour,
    endHour,
    snapMinutes,
    onSelectSlot,
    onMoveBlock,
    placeLabel,
    acceptsDrop,
  };
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  /** The column and the minute under a point of the screen; none outside every column. */
  function pointAt(clientX: number, clientY: number) {
    for (const [columnKey, element] of bodies.current) {
      const box = element.getBoundingClientRect();
      if (clientX < box.left || clientX >= box.right) continue;
      const first = live.current.firstHour * 60;
      const last = live.current.endHour * 60 - 1;
      const minute = first + (clientY - box.top) / MINUTE_PX;
      return { columnKey, minute: Math.min(Math.max(minute, first), last) };
    }
    return null;
  }

  /** Follows the pointer on the window until it is released or the press is cancelled. */
  function track(
    onMove: (event: PointerEvent) => void,
    onUp: (event: PointerEvent) => void,
    onEnd: () => void,
  ) {
    const previousSelect = document.body.style.userSelect;
    const finish = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
      document.body.style.userSelect = previousSelect;
      stop.current = null;
      onEnd();
    };
    const up = (event: PointerEvent) => {
      finish();
      onUp(event);
    };
    const cancel = () => finish();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    document.body.style.userSelect = 'none';
    stop.current = finish;
  }

  function startSelecting(event: ReactPointerEvent<HTMLDivElement>, columnKey: string) {
    // Only a press on the empty column: a block, and the buttons in it, keep their own press.
    if (!onSelectSlot || event.button !== 0 || event.target !== event.currentTarget) return;
    const start = pointAt(event.clientX, event.clientY);
    if (!start) return;
    const origin = { x: event.clientX, y: event.clientY };
    let moved = false;
    let current = start.minute;
    setSelecting({ columnKey, anchor: start.minute, current });
    track(
      (move) => {
        const point = pointAt(move.clientX, move.clientY);
        if (!point || point.columnKey !== columnKey) return;
        if (Math.hypot(move.clientX - origin.x, move.clientY - origin.y) > DRAG_THRESHOLD_PX) {
          moved = true;
        }
        current = point.minute;
        setSelecting({ columnKey, anchor: start.minute, current });
      },
      () => {
        const step = live.current.snapMinutes;
        const low = Math.min(start.minute, current);
        const high = Math.max(start.minute, current);
        const startMinute = Math.floor(low / step) * step;
        const endMinute = moved
          ? Math.max(Math.ceil(high / step) * step, startMinute + step)
          : startMinute + step;
        live.current.onSelectSlot?.({ columnKey, startMinute, endMinute, dragged: moved });
      },
      () => setSelecting(null),
    );
  }

  function startDragging(
    event: ReactPointerEvent<HTMLDivElement>,
    columnKey: string,
    block: WeekGridBlock,
  ) {
    if (!onMoveBlock || !block.movable || event.button !== 0) return;
    const press = pointAt(event.clientX, event.clientY);
    if (!press) return;
    const origin = { x: event.clientX, y: event.clientY };
    const duration = block.endMinute - block.startMinute;
    const grab = press.minute - block.startMinute;
    let active = false;
    let target: Dragging['target'] = null;
    const show = () =>
      setDragging({ blockKey: block.key, fromColumnKey: columnKey, duration, grab, target });
    track(
      (move) => {
        if (
          !active &&
          Math.hypot(move.clientX - origin.x, move.clientY - origin.y) < DRAG_THRESHOLD_PX
        ) {
          return;
        }
        active = true;
        const point = pointAt(move.clientX, move.clientY);
        const step = live.current.snapMinutes;
        const start = point ? Math.round((point.minute - grab) / step) * step : 0;
        const first = live.current.firstHour * 60;
        const startMinute = Math.max(first, start);
        const allowed =
          point &&
          (point.columnKey === columnKey ||
            (live.current.acceptsDrop?.(block.key, columnKey, point.columnKey) ?? true)) &&
          (!live.current.placeLabel ||
            live.current.placeLabel(point.columnKey, startMinute) !== undefined);
        target = point && allowed ? { columnKey: point.columnKey, startMinute } : null;
        show();
      },
      () => {
        if (!active) return;
        // The click that ends this press is not a click on the block.
        const swallow = (click: MouseEvent) => {
          click.stopPropagation();
          click.preventDefault();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
        if (!target) return;
        const unmoved = target.columnKey === columnKey && target.startMinute === block.startMinute;
        if (!unmoved) {
          live.current.onMoveBlock?.({
            blockKey: block.key,
            fromColumnKey: columnKey,
            columnKey: target.columnKey,
            startMinute: target.startMinute,
          });
        }
      },
      () => setDragging(null),
    );
  }

  const selection =
    selecting && Math.abs(selecting.current - selecting.anchor) * MINUTE_PX > DRAG_THRESHOLD_PX
      ? {
          columnKey: selecting.columnKey,
          start:
            Math.floor(Math.min(selecting.anchor, selecting.current) / snapMinutes) * snapMinutes,
          end: Math.ceil(Math.max(selecting.anchor, selecting.current) / snapMinutes) * snapMinutes,
        }
      : null;

  return (
    <section
      data-slot="week-grid"
      aria-label={label}
      // Scrollable when the columns do not fit, so the keyboard can scroll it too.
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable.
      tabIndex={0}
      className={cn('overflow-x-auto rounded-xl border bg-card', className)}
    >
      <div
        className={columns.length > 2 && !minColumnRem ? 'min-w-176' : undefined}
        style={
          minColumnRem ? { minWidth: `${3.25 + columns.length * minColumnRem}rem` } : undefined
        }
      >
        <div
          data-slot="week-grid-header"
          className="sticky top-0 z-10 grid border-b bg-card"
          style={template}
        >
          <span />
          {columns.map((column) => (
            <div
              key={column.key}
              data-today={column.today ? '' : undefined}
              className="flex min-h-11 min-w-0 items-center justify-center border-s px-1 text-center text-sm data-today:font-semibold data-today:text-accent-text"
            >
              {column.header}
            </div>
          ))}
        </div>
        <div
          data-slot="week-grid-body"
          className="relative grid"
          style={{ ...template, height: hours.length * HOUR_PX }}
        >
          <div aria-hidden="true" className="relative">
            {hours.map((hour, index) => (
              <span
                key={hour}
                className="absolute inset-x-0 pe-2 text-right text-xs text-muted-foreground tabular-nums"
                style={{ top: index * HOUR_PX - (index === 0 ? 0 : 7) }}
              >
                {hourLabel(hour)}
              </span>
            ))}
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-13 end-0">
            {hours.map((hour, index) => (
              <span
                key={hour}
                className="absolute inset-x-0 border-t border-border"
                style={{ top: index * HOUR_PX }}
              />
            ))}
          </div>
          {columns.map((column) => (
            <div
              key={column.key}
              ref={(element) => {
                if (element) bodies.current.set(column.key, element);
                else bodies.current.delete(column.key);
              }}
              data-today={column.today ? '' : undefined}
              data-column={column.key}
              onPointerDown={(event) => startSelecting(event, column.key)}
              className={cn(
                'relative border-s data-today:bg-accent/5',
                onSelectSlot && 'cursor-cell touch-pan-y',
              )}
            >
              {column.nowMinute === undefined ? null : (
                <span
                  data-slot="week-grid-now"
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-accent-text"
                  style={{ top: (column.nowMinute - firstHour * 60) * MINUTE_PX }}
                />
              )}
              {selection && selection.columnKey === column.key ? (
                <div
                  data-slot="week-grid-selection"
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0.5 z-10 rounded-md border-2 border-accent-text bg-accent/10"
                  style={{
                    top: (selection.start - firstHour * 60) * MINUTE_PX,
                    height: (selection.end - selection.start) * MINUTE_PX,
                  }}
                />
              ) : null}
              {dragging?.target?.columnKey === column.key ? (
                <div
                  data-slot="week-grid-ghost"
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0.5 z-20 rounded-md border-2 border-dashed border-accent-text bg-accent/10 px-1.5 py-0.5 text-xs font-semibold text-accent-text tabular-nums"
                  style={{
                    top: (dragging.target.startMinute - firstHour * 60) * MINUTE_PX,
                    height: Math.max(dragging.duration * MINUTE_PX - 2, MIN_BLOCK_PX),
                  }}
                >
                  {placeLabel?.(column.key, dragging.target.startMinute)}
                </div>
              ) : null}
              {column.blocks.map((block) => (
                <div
                  key={block.key}
                  data-movable={block.movable && onMoveBlock ? '' : undefined}
                  data-dragging={dragging?.blockKey === block.key ? '' : undefined}
                  onPointerDown={(event) => startDragging(event, column.key, block)}
                  className="absolute data-dragging:opacity-40 data-movable:cursor-grab"
                  style={{
                    top: (block.startMinute - firstHour * 60) * MINUTE_PX,
                    height: Math.max(
                      (block.endMinute - block.startMinute) * MINUTE_PX - 2,
                      MIN_BLOCK_PX,
                    ),
                    left: `calc(${(block.lane / block.lanes) * 100}% + 2px)`,
                    width: `calc(${100 / block.lanes}% - 4px)`,
                  }}
                >
                  {block.children}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export { type SessionBlockProps, sessionBlockVariants } from './session-block';
