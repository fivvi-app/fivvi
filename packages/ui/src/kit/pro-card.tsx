import { cn } from 'cn';
import type { ComponentProps } from 'react';

/**
 * The Fivvi Pro card: `radius.card` (26px, the same in both themes), the theme's card colours and
 * 16px of padding. The shadcn `Card` keeps the trainer web's smaller radius.
 */
export function ProCard({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="pro-card"
      className={cn('rounded-card bg-card p-4 text-card-foreground', className)}
      {...props}
    />
  );
}
