'use client';

import type { Locale } from '@fivvi/i18n';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { alternatePath } from './routes';

export interface LanguageOption {
  locale: Locale;
  /** The `lang` of the option: it is named in its own language. */
  lang: string;
  short: string;
  name: string;
}

/**
 * The *NL | EN* switch (AC16): two plain links to the same page in each language. It sets no
 * cookie, stores nothing and redirects nobody by their browser's language; the language is the
 * path (ADR-030). The current language is marked with `aria-current`.
 */
export function LanguageSwitch({
  label,
  current,
  options,
}: {
  label: string;
  current: Locale;
  options: readonly LanguageOption[];
}) {
  const pathname = usePathname();
  // The page in the current language, then the same page in each language.
  const here = alternatePath(pathname, current);
  return (
    <nav aria-label={label} className="flex rounded-full bg-muted p-0.5 text-[13px] font-semibold">
      {options.map(({ locale, lang, short, name }) => (
        <Link
          key={locale}
          // The other root layout: a full page load, and nothing to prefetch.
          prefetch={false}
          href={(locale === current ? here : alternatePath(pathname, locale)) as never}
          lang={lang}
          aria-label={name}
          aria-current={locale === current ? 'true' : undefined}
          className="rounded-full px-2.5 py-1 text-muted-foreground aria-[current=true]:bg-card aria-[current=true]:text-foreground aria-[current=true]:shadow-xs"
        >
          {short}
        </Link>
      ))}
    </nav>
  );
}
