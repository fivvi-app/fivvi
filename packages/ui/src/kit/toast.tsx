import { cn } from 'cn';
import type { ComponentProps } from 'react';
import { WarningIcon } from './icons';

/**
 * A toast, on the inverse of the page colours, at the bottom centre. A `warning` toast carries a
 * warning icon and is announced at once (`role="alert"`); a plain one is polite (`role="status"`).
 * The icon takes the text colour, so it needs no colour pair of its own.
 */
export function Toast({
  className,
  tone = 'default',
  children,
  ...props
}: ComponentProps<'div'> & { tone?: 'default' | 'warning' }) {
  const warning = tone === 'warning';

  return (
    <div
      data-slot="toast"
      data-tone={tone}
      role={warning ? 'alert' : 'status'}
      className={cn(
        'fixed bottom-6 left-1/2 z-50 flex max-w-[92%] -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-4.5 py-3 text-[15px] font-semibold text-background shadow-lg',
        className,
      )}
      {...props}
    >
      {warning ? <WarningIcon className="size-4.5 shrink-0" /> : null}
      {children}
    </div>
  );
}
