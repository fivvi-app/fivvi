'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const icons = {
  // The prototype's icons (`docs/design/prototype-v2/app.js`), drawn on a 24px grid.
  clients: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M17.5 14.6c2.2.3 3.6 1.9 4 4.4" />
    </>
  ),
  trainers: (
    <>
      <circle cx="10" cy="8.5" r="3.5" />
      <path d="M3.5 20c.8-3.6 3.3-5.5 6.5-5.5 1.6 0 3 .5 4.1 1.4M18 13v6M15 16h6" />
    </>
  ),
  settings: <path d="M4 20l1-4.5L16 4.5l3.5 3.5-11 11z" />,
} satisfies Record<string, ReactNode>;

/** One section of the navigation. `base` is the path it covers, when that is more than its link. */
export type NavItem = {
  href: string;
  base?: string;
  label: string;
  icon: keyof typeof icons;
  /** The pages of the section, listed under it. */
  children?: readonly { href: string; label: string }[];
};

const link =
  'flex items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground';

/** Whether `pathname` is `base` or a page below it. */
function within(pathname: string | null, base: string): boolean {
  return pathname === base || Boolean(pathname?.startsWith(`${base}/`));
}

/**
 * The navigation of a workspace's sidebar (`information-architecture.md §4.1`): the sections the
 * server lists for this person, each with an icon, the one the person is on marked as the current
 * page (the prototype's highlighted row, the icon in the accent text). The sub-pages of a section
 * are listed under it. Which sections there are is decided by the frame from the person's
 * capabilities; nothing here knows a role.
 */
export function SidebarNav({ label, items }: { label: string; items: readonly NavItem[] }) {
  const pathname = usePathname();
  const current = (base: string) => (within(pathname, base) ? ('page' as const) : undefined);

  return (
    <nav aria-label={label}>
      <div className="grid gap-px">
        {items.map((item) => (
          <div key={item.href} className="grid gap-px">
            <Link
              href={item.href as Route}
              aria-current={current(item.base ?? item.href)}
              className={`${link} h-8.5 aria-[current=page]:[&>svg]:text-accent-text`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="size-4.5 shrink-0"
              >
                {icons[item.icon]}
              </svg>
              <span className="truncate">{item.label}</span>
            </Link>
            {item.children ? (
              <ul className="ms-5 grid gap-px border-s ps-2">
                {item.children.map((child) => (
                  <li key={child.href}>
                    <Link
                      href={child.href as Route}
                      aria-current={current(child.href)}
                      className={`${link} h-8 text-[13px]`}
                    >
                      <span className="truncate">{child.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </nav>
  );
}
