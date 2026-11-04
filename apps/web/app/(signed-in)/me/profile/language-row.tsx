'use client';

import type { Locale } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import { Card, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { catalogLocale } from '../../../../i18n/config';
import { saveLanguage } from '../../w/[slug]/language-client';

/** The options, each written in its own language (`packages/i18n/GLOSSARY.md` §4.8). */
const OPTIONS = [
  { locale: 'nl-NL', lang: 'nl', name: 'languageNl' },
  { locale: 'en', lang: 'en', name: 'languageEn' },
] as const satisfies readonly { locale: Locale; lang: string; name: string }[];

/**
 * The *Taal* / *Language* row of TW-09 My profile (F010), the same choice as in the user menu: the
 * two languages in their own language with the current one marked. Choosing one saves it on the
 * account first, then asks the server for the page again, so it re-renders in the new language in
 * place. When the save fails the page keeps its language and says so.
 */
export function LanguageRow() {
  const t = useTranslations('userMenu');
  const profile = useTranslations('profile');
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
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{profile('language')}</h2>
        </CardTitle>
      </CardHeader>
      <div className="grid gap-1 px-6 pb-6">
        {OPTIONS.map(({ locale, lang, name }) => (
          <Button
            key={locale}
            type="button"
            variant="ghost"
            className="w-full justify-start gap-2"
            lang={lang}
            aria-pressed={locale === current}
            disabled={!ready || pending}
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
      </div>
      {failed ? (
        <p role="alert" className="px-6 pb-6 text-sm text-status-danger-fg">
          {t('error')}
        </p>
      ) : null}
    </Card>
  );
}
