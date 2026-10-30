'use client';

import type { Locale } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { catalogLocale } from '../../i18n/config';
import { chooseSignInLanguage } from './language-cookies';

/** The options, each written in its own language (`packages/i18n/GLOSSARY.md` §4.8). */
const OPTIONS = [
  { locale: 'nl-NL', lang: 'nl', name: 'languageNl' },
  { locale: 'en', lang: 'en', name: 'languageEn' },
] as const satisfies readonly { locale: Locale; lang: string; name: string }[];

/**
 * TW-10's *Nederlands | English* switch (F010). Nobody is signed in, so nothing is saved on an
 * account: the choice goes into the cookies of this browser (`chooseSignInLanguage`) and the page
 * asks the server for itself again, which re-renders in place in the new language. The sign-in
 * email follows it, and signing in saves it as the account's language.
 */
export function LanguageSwitch() {
  const t = useTranslations('signIn');
  const router = useRouter();
  const current = catalogLocale(useLocale());
  // The buttons wait for the page to hydrate: a click before that would be lost.
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  function choose(locale: Locale) {
    if (locale === current) return;
    chooseSignInLanguage(locale, document);
    router.refresh();
  }

  return (
    <fieldset className="flex gap-1 border-0 p-0">
      <legend className="sr-only">{t('languageLabel')}</legend>
      {OPTIONS.map(({ locale, lang, name }) => (
        <Button
          key={locale}
          type="button"
          variant="ghost"
          size="sm"
          lang={lang}
          aria-pressed={locale === current}
          disabled={!ready}
          onClick={() => choose(locale)}
        >
          {t(name)}
        </Button>
      ))}
    </fieldset>
  );
}
