'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentProps } from 'react';

/**
 * A link of the header that says it is the current page (`aria-current="page"`) when the page is
 * its own. The path comes from the router, which a static page knows at build time.
 */
export function NavLink({
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, 'href' | 'aria-current'> & { href: string }) {
  const current = usePathname() === href;
  // The addresses are the site's own (routes.ts), not typed routes of the app.
  return <Link href={href as never} aria-current={current ? 'page' : undefined} {...props} />;
}
