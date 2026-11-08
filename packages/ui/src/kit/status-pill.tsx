import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import type { ComponentProps } from 'react';

// Each text colour is declared against its tint in the token package's contrast pairs.
const statusPillVariants = cva(
  'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[13px] font-semibold whitespace-nowrap tabular-nums',
  {
    variants: {
      tone: {
        neutral: 'bg-status-neutral-bg text-status-neutral-fg',
        success: 'bg-status-success-bg text-status-success-text',
        warning: 'bg-status-warning-bg text-status-warning-text',
        danger: 'bg-status-danger-bg text-status-danger-text',
        private: 'bg-session-private-bg text-session-private-text',
        group: 'bg-session-group-bg text-session-group-text',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

/** A status or session type as a small pill: a tint of its colour with the text colour that passes on it. */
export function StatusPill({
  className,
  tone,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof statusPillVariants>) {
  return (
    <span
      data-slot="status-pill"
      data-tone={tone ?? 'neutral'}
      className={cn(statusPillVariants({ tone }), className)}
      {...props}
    />
  );
}

export { statusPillVariants };
