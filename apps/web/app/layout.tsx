import { readPageViewsConfig } from '@trainer-hub/observability/page-views';
import '@trainer-hub/ui/globals.css';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import './display-font';
import { PageViews } from './page-views';

// Pages without their own title still get one: axe requires a <title> (WCAG 2.4.2).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: t('title') };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  // Read at request time (this layout is dynamic: the locale comes from the request), so the
  // same build sends page views only where NEXT_PUBLIC_POSTHOG_KEY is set: production.
  const pageViews = readPageViewsConfig(process.env);
  return (
    <html lang={locale}>
      {/* Touch density for public and client pages; Trainer Web layouts opt into compact. */}
      <body data-density="touch">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        {pageViews.key ? <PageViews projectKey={pageViews.key} /> : null}
      </body>
    </html>
  );
}
