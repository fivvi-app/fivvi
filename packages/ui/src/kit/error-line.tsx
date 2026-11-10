import { cn } from 'cn';
import type { ComponentProps } from 'react';
import { WarningIcon } from './icons';

/**
 * A refusal in words: the warning icon and the message in the danger text colour, announced when
 * it appears (`role="alert"`). `Field` uses it under its input; a screen without a field (a failed
 * request, a link that cannot be confirmed) uses it on its own. The text comes from `packages/i18n`.
 */
export function ErrorLine({ className, children, ...props }: ComponentProps<'p'>) {
  return (
    <p
      {...props}
      role="alert"
      data-slot="error-line"
      className={cn(
        'flex items-center gap-1.5 text-[13px] font-semibold text-status-danger-fg',
        className,
      )}
    >
      <WarningIcon className="size-3.5 shrink-0" />
      {children}
    </p>
  );
}
