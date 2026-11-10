import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import type { ComponentProps } from 'react';

const avatarVariants = cva(
  // The letters come from `data-initials` through `::before`, so they are no text in the page: the
  // name beside the avatar says who it is. Foreground on the muted fill is declared and passes.
  'grid shrink-0 place-items-center rounded-full bg-muted font-bold text-foreground before:content-[attr(data-initials)]',
  {
    variants: {
      size: {
        default: 'size-7 text-[11px]',
        lg: 'size-14 text-xl',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

/**
 * A person's mark: their initials on the neutral fill, round, hidden from screen readers. The
 * prototype tints each client's avatar with a colour of its own, which Fivvi has no source for;
 * the neutral one is the prototype's default and passes the contrast rule.
 */
export function Avatar({
  className,
  initials,
  size,
  ...props
}: Omit<ComponentProps<'span'>, 'children'> &
  VariantProps<typeof avatarVariants> & {
    /** The letters, such as `AV` (the first letters of a name). */
    initials: string;
  }) {
  return (
    <span
      {...props}
      data-slot="avatar"
      data-initials={initials}
      aria-hidden="true"
      className={cn(avatarVariants({ size }), className)}
    />
  );
}

export { avatarVariants };
