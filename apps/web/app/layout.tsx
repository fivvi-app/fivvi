import '@trainer-hub/ui/globals.css';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import './display-font';

// Pages without their own title still get one: axe requires a <title> (WCAG 2.4.2).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: t('title') };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      {/* Touch density for public and client pages; Trainer Web layouts opt into compact. */}
      <body data-density="touch">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
