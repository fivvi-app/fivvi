import { cn } from 'cn';
import type { ComponentProps } from 'react';

/**
 * A message that it went well ("Opgeslagen."): the success text colour, announced politely
 * (`role="status"`). The counterpart of `ErrorLine`. The text comes from `packages/i18n`.
 */
export function SuccessLine({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      role="status"
      data-slot="success-line"
      className={cn('text-sm font-semibold text-status-success-text', className)}
      {...props}
    />
  );
}
