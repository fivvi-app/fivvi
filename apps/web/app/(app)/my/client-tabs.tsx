'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/** A line icon of the tab bar. Decorative: the tab's label names it. */
function TabIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-6"
    >
      {children}
    </svg>
  );
}

/** The tabs as in the app (`DECISIONS.md` §6, *Client web tabs*): *Activiteit* arrives with M7. */
const TABS = [
  {
    key: 'home',
    href: '/my',
    icon: (
      <TabIcon>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5.5 10v9.5h13V10" />
      </TabIcon>
    ),
  },
  {
    key: 'book',
    href: '/my/book',
    icon: (
      <TabIcon>
        <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </TabIcon>
    ),
  },
  {
    key: 'profile',
    href: '/my/profile',
    icon: (
      <TabIcon>
        <circle cx="12" cy="8.5" r="4" />
        <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
      </TabIcon>
    ),
  },
] as const satisfies readonly {
  key: 'home' | 'book' | 'profile';
  href: string;
  icon: ReactNode;
}[];

/**
 * The tab bar of the client web (F030): *Home · Boeken · Profiel*, three links, the page the
 * person is on marked with `aria-current`. Each is at least 44 px high.
 */
export function ClientTabs() {
  const t = useTranslations('clientNav');
  const pathname = usePathname();
  return (
    <nav aria-label={t('label')}>
      <ul className="flex items-stretch gap-1 py-1.5">
        {TABS.map(({ key, href, icon }) => {
          const current = href === pathname || (href !== '/my' && pathname?.startsWith(`${href}/`));
          return (
            <li key={key} className="flex-1">
              <Link
                href={href}
                prefetch={false}
                aria-current={current ? 'page' : undefined}
                className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold text-foreground aria-[current=page]:bg-secondary aria-[current=page]:text-accent-text"
              >
                {icon}
                <span>{t(key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
