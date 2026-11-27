'use client';

import type { Locale } from '@fivvi/i18n';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { catalogLocale } from '../../../i18n/config';
import { saveLanguage } from '../(signed-in)/language/language-client';

/**
 * The options: the short label, and the name in its own language for screen readers. The name
 * is hidden text after the short label, so the accessible name contains the visible one (WCAG
 * 2.5.3 Label in Name).
 */
const OPTIONS = [
  { locale: 'nl-NL', lang: 'nl', short: 'nlShort', name: 'nlName' },
  { locale: 'en', lang: 'en', short: 'enShort', name: 'enName' },
] as const satisfies readonly { locale: Locale; lang: string; short: string; name: string }[];

/**
 * The *NL | EN* switch in the header of every client web page (F030, F010). Choosing a language
 * saves it on the account first, then asks the server for the page again, which re-renders in
 * place in the new language. When the save fails the page keeps its language and says so.
 */
export function ClientLanguageSwitch() {
  const t = useTranslations('clientWeb.language');
  const router = useRouter();
  const current = catalogLocale(useLocale());
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  // The buttons wait for the page to hydrate: a click before that would be lost.
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  async function choose(locale: Locale) {
    if (locale === current) return;
    setPending(true);
    setFailed(false);
    const { ok } = await saveLanguage(locale);
    setPending(false);
    if (!ok) return setFailed(true);
    router.refresh();
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      {failed ? <ErrorLine>{t('error')}</ErrorLine> : null}
      <fieldset className="flex rounded-full bg-foreground/10 p-0.5 text-[13px] font-semibold">
        <legend className="sr-only">{t('label')}</legend>
        {OPTIONS.map(({ locale, lang, short, name }) => (
          <button
            key={locale}
            type="button"
            lang={lang}
            aria-pressed={locale === current}
            disabled={!ready || pending}
            onClick={() => choose(locale)}
            className="min-h-9 min-w-11 rounded-full px-2.5 text-secondary-foreground aria-pressed:bg-card aria-pressed:text-card-foreground aria-pressed:shadow-xs"
          >
            {t(short)}
            <span className="sr-only"> {t(name)}</span>
          </button>
        ))}
      </fieldset>
    </div>
  );
}
