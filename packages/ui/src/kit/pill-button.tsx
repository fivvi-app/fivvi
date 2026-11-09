import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';

const pillButtonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-[17px] font-semibold whitespace-nowrap transition-colors outline-none select-none disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-pressed',
        tonal: 'bg-secondary text-accent-text',
        danger:
          'bg-destructive/10 text-destructive hover:bg-destructive/15 dark:bg-destructive/15 dark:hover:bg-destructive/20',
        ghost: 'text-accent-text hover:bg-muted',
      },
      size: {
        default: 'h-12.5 px-5.5',
        sm: 'h-9 px-3.5 text-[15px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

/**
 * The pill button: 50px high, fully rounded, a label of 17px semibold. `primary` is the accent,
 * `tonal` the quiet fill, `danger` the filled red (white on `#D93033`, 4.75:1) and `ghost` accent
 * text without a fill. Use `PillButtonStack` for buttons one under another.
 */
export function PillButton({
  className,
  variant,
  size,
  asChild = false,
  type = 'button',
  ...props
}: ComponentProps<'button'> &
  VariantProps<typeof pillButtonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="pill-button"
      {...(asChild ? {} : { type })}
      className={cn(pillButtonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

/** Pill buttons one under another: each full width and 48px high, with 10px between them. */
export function PillButtonStack({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="pill-button-stack"
      className={cn(
        'flex flex-col gap-2.5 [&>[data-slot=pill-button]]:h-12 [&>[data-slot=pill-button]]:w-full',
        className,
      )}
      {...props}
    />
  );
}

export { pillButtonVariants };
