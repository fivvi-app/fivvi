import type { ComponentProps } from 'react';
import { type Studio, studioPath } from './client-studio';
import { StudioMark } from './studio-mark';

/**
 * One studio as a row of an inset list (the home and *Je studio's*): its mark, its name and what
 * ends the row. A plain link: the address answers with the redirect to *Boeken* and a cookie, so it
 * works before the page has hydrated.
 */
export function StudioRow({
  studio: { slug, name },
  children,
  ...props
}: Omit<ComponentProps<'a'>, 'href' | 'className'> & { studio: Studio }) {
  return (
    <a
      {...props}
      href={studioPath(slug)}
      className="-mx-4 -my-2.5 flex min-h-13 flex-1 items-center gap-3 px-4 py-2.5 text-start"
    >
      <StudioMark name={name} size="lg" />
      <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{name}</span>
      {children}
    </a>
  );
}
