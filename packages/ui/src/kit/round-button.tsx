import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import type { ComponentProps } from 'react';

const roundButtonVariants = cva(
  'inline-flex size-12 shrink-0 items-center justify-center rounded-full outline-none select-none hover:brightness-95 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-6 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground',
        tonal: 'bg-secondary text-secondary-foreground',
        glass: 'glass text-foreground',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
);

/**
 * A round control, the + button and the header's back button: 48px, always round, with an icon
 * and no text, so it must be named (`aria-label`, from `packages/i18n`).
 */
export function RoundButton({
  className,
  variant,
  type = 'button',
  ...props
}: Omit<ComponentProps<'button'>, 'aria-label'> &
  VariantProps<typeof roundButtonVariants> & { 'aria-label': string }) {
  return (
    <button
      data-slot="round-button"
      type={type}
      className={cn(roundButtonVariants({ variant }), className)}
      {...props}
    />
  );
}

export { roundButtonVariants };
