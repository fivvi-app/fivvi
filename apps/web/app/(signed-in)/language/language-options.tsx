'use client';

import type { Locale } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { catalogLocale } from '../../../i18n/config';
import { saveLanguage } from './language-client';

/** The options, each written in its own language (`packages/i18n/GLOSSARY.md` §4.8). */
const OPTIONS = [
  { locale: 'nl-NL', lang: 'nl', name: 'languageNl' },
  { locale: 'en', lang: 'en', name: 'languageEn' },
] as const satisfies readonly { locale: Locale; lang: string; name: string }[];

/** The name of a language in its own language, as `LanguageOptions` writes it. */
export function languageNameKey(locale: Locale): 'languageNl' | 'languageEn' {
  return OPTIONS.find((option) => option.locale === locale)?.name ?? 'languageNl';
}

/**
 * The two languages as buttons in their own language, the current one marked (F010): the choice of
 * the user menu and of the *Taal* / *Language* row of TW-09. Choosing one saves it on the account
 * first, then asks the server for the page again: it re-renders in the new language in place,
 * without a reload, so what was typed stays. `onDone` runs after a save, and when the current
 * language is chosen again. When the save fails the page keeps its language and says so.
 */
export function LanguageOptions({
  id,
  labelledBy,
  disabled = false,
  onDone,
}: {
  id?: string;
  /** The id of the element that names the group. */
  labelledBy?: string;
  /** True while the page has not hydrated yet: a click before that would be lost. */
  disabled?: boolean;
  onDone?: () => void;
}) {
  const t = useTranslations('userMenu');
  const router = useRouter();
  const current = catalogLocale(useLocale());
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  async function choose(locale: Locale) {
    if (locale === current) return onDone?.();
    setPending(true);
    setFailed(false);
    const { ok } = await saveLanguage(locale);
    setPending(false);
    if (!ok) return setFailed(true);
    onDone?.();
    router.refresh();
  }

  return (
    <>
      <fieldset id={id} aria-labelledby={labelledBy} className="grid min-w-0 gap-1">
        {OPTIONS.map(({ locale, lang, name }) => (
          <Button
            key={locale}
            type="button"
            variant="ghost"
            className="w-full justify-start gap-2"
            lang={lang}
            aria-pressed={locale === current}
            disabled={disabled || pending}
            onClick={() => choose(locale)}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={locale === current ? '' : 'invisible'}
            >
              <path d="M3 8.5l3 3 7-7" />
            </svg>
            {t(name)}
          </Button>
        ))}
      </fieldset>
      {failed ? (
        <p role="alert" className="px-2 py-1 text-sm text-status-danger-fg">
          {t('error')}
        </p>
      ) : null}
    </>
  );
}
