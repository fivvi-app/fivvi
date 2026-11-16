import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import type { CSSProperties, ReactNode } from 'react';

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
}

export interface WeekGridColumn {
  key: string;
  /** The column's header: a day, or a workspace in the day view. */
  header: ReactNode;
  /** Today's column is tinted. */
  today?: boolean;
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
  className?: string;
}) {
  const hours = Array.from({ length: endHour - firstHour }, (_, index) => firstHour + index);
  const template = {
    gridTemplateColumns: `3.25rem repeat(${columns.length}, minmax(0, 1fr))`,
  } satisfies CSSProperties;

  return (
    <section
      data-slot="week-grid"
      aria-label={label}
      // Scrollable when the columns do not fit, so the keyboard can scroll it too.
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable.
      tabIndex={0}
      className={cn('overflow-x-auto rounded-xl border bg-card', className)}
    >
      <div className="min-w-176">
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
              data-today={column.today ? '' : undefined}
              className="relative border-s data-today:bg-accent/5"
            >
              {column.blocks.map((block) => (
                <div
                  key={block.key}
                  className="absolute"
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

/**
 * The face of a block in the grid (or of a row elsewhere): a tint of the session type's colour
 * with the text colour that passes on it and a bar on the start edge; a cancelled one is grey and
 * hatched. Colour only supports the label: the caller starts every block with its type in words.
 */
export const sessionBlockVariants = cva(
  'flex size-full min-w-0 flex-col overflow-hidden rounded-md border-s-4 px-1.5 py-0.5 text-start text-xs leading-4 outline-offset-1',
  {
    variants: {
      tone: {
        private: 'border-session-private-solid bg-session-private-bg text-session-private-text',
        group: 'border-session-group-solid bg-session-group-bg text-session-group-text',
        cancelled:
          'border-muted-foreground bg-muted bg-[image:repeating-linear-gradient(135deg,transparent_0_4px,var(--border)_4px_5px)] text-muted-foreground',
      },
    },
    defaultVariants: { tone: 'private' },
  },
);

export type SessionBlockProps = VariantProps<typeof sessionBlockVariants>;
