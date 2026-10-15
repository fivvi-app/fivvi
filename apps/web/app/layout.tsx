import '@trainer-hub/ui/globals.css';
import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

// Pages without their own title still get one: axe requires a <title> (WCAG 2.4.2).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: t('title') };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
