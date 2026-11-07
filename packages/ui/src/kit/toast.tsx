import { cva } from 'class-variance-authority';
import { cn } from 'cn';
import type { ComponentProps } from 'react';
import { WarningIcon } from './icons';

// The two web surfaces differ (DECISIONS.md section 2, web.css, styles.css):
// - trainer: the inverse of the page colours, radius 10, bottom right; a warning is a red fill
//   with white text and icon (`action.danger.bg` and `.fg` are a declared pair);
// - client: a glass pill above the tab bar (104px), the warning icon in the danger colour.
const toastVariants = cva('fixed z-50 flex max-w-[92%] items-center gap-2 font-semibold', {
  variants: {
    surface: {
      trainer: 'right-7 bottom-7 rounded-[10px] px-4.5 py-3 text-[15px] shadow-lg',
      client:
        'glass bottom-26 left-1/2 -translate-x-1/2 rounded-full px-4.5 py-3 text-[15px] text-foreground',
    },
    tone: { default: '', warning: '' },
  },
  compoundVariants: [
    { surface: 'trainer', tone: 'default', className: 'bg-foreground text-background' },
    {
      surface: 'trainer',
      tone: 'warning',
      className: 'bg-action-danger-bg text-action-danger-fg',
    },
  ],
  defaultVariants: { surface: 'trainer', tone: 'default' },
});

/**
 * A toast. `surface` is the page it appears on: `trainer` (the default) or `client`. A `warning`
 * toast carries a warning icon and is announced at once (`role="alert"`); a plain one is polite
 * (`role="status"`). On the trainer web the icon takes the text colour; on the client web it is
 * `status.danger.fg`, which passes on the canvas and on cards.
 */
export function Toast({
  className,
  surface = 'trainer',
  tone = 'default',
  children,
  ...props
}: ComponentProps<'div'> & { surface?: 'trainer' | 'client'; tone?: 'default' | 'warning' }) {
  const warning = tone === 'warning';

  return (
    <div
      data-slot="toast"
      data-surface={surface}
      data-tone={tone}
      role={warning ? 'alert' : 'status'}
      className={cn(toastVariants({ surface, tone }), className)}
      {...props}
    >
      {warning ? (
        <WarningIcon
          className={cn('size-4.5 shrink-0', surface === 'client' && 'text-status-danger-fg')}
        />
      ) : null}
      {children}
    </div>
  );
}
