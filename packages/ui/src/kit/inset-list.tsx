import { cn } from 'cn';
import type { ComponentProps } from 'react';

/**
 * An inset grouped list: rows in one rounded card on the grey canvas, with a hairline between
 * them that starts 16px in. Put the rows in `InsetListItem`. A row that does something holds a
 * link or a button that fills it (`-mx-4 -my-2.5 flex flex-1 items-center gap-3 px-4 py-2.5`).
 */
export function InsetList({ className, ...props }: ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="inset-list"
      className={cn('overflow-hidden rounded-card bg-card text-card-foreground', className)}
      {...props}
    />
  );
}

export function InsetListItem({ className, ...props }: ComponentProps<'li'>) {
  return (
    <li
      data-slot="inset-list-item"
      className={cn(
        "relative flex min-h-13 items-center gap-3 px-4 py-2.5 not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:left-4 not-first:before:h-px not-first:before:bg-border not-first:before:content-['']",
        className,
      )}
      {...props}
    />
  );
}
