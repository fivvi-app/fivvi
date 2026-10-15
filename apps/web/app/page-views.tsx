'use client';

import { capturePageView } from '@trainer-hub/observability/page-views';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Sends a cookieless page view to PostHog on every page load and client-side navigation (E009,
 * docs/engineering/OBSERVABILITY.md §5). A new query string on the same path is not a new page.
 * The layout only renders this with a PostHog key, so without one posthog-js is never loaded.
 */
export function PageViews({ projectKey }: { projectKey: string }) {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) void capturePageView(projectKey);
  }, [projectKey, pathname]);
  return null;
}
