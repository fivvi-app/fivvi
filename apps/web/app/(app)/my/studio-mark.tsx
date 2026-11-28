import { PlusIcon } from '@fivvi/ui/kit/icons';
import type { ComponentProps } from 'react';
import { initials } from '../(signed-in)/w/[slug]/workspace-initials';

/** The sizes of the prototype's `c-mark`: 26px in the header, 42px in a row. */
const SIZES = {
  sm: 'size-[26px] rounded-lg text-[10px]',
  lg: 'size-[42px] rounded-xl text-[15px]',
} as const;

/**
 * A studio's mark (`DECISIONS.md` §5b): a rounded square, like an app icon, with the studio's
 * initials. Fivvi has no colour per studio, so every mark has the accent of the client theme. Hidden
 * from screen readers: the studio's name stands beside it.
 */
export function StudioMark({
  name,
  size,
  ...props
}: Omit<ComponentProps<'span'>, 'children' | 'className'> & {
  name: string;
  size: keyof typeof SIZES;
}) {
  return (
    <span
      {...props}
      data-slot="studio-mark"
      data-initials={initials(name)}
      aria-hidden="true"
      className={`grid shrink-0 place-items-center bg-primary font-extrabold text-primary-foreground before:content-[attr(data-initials)] ${SIZES[size]}`}
    />
  );
}

/** The plus mark of *Studio toevoegen* (the prototype's `c-mark lg add`): a mark that is no studio. */
export function AddMark() {
  return (
    <span
      aria-hidden="true"
      className="grid size-[42px] shrink-0 place-items-center rounded-xl bg-secondary text-accent-text"
    >
      <PlusIcon className="size-5" />
    </span>
  );
}
