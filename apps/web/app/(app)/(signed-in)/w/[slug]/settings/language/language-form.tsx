'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import type { Locale } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@fivvi/ui/components/card';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { PageShell } from '@fivvi/ui/kit/page-shell';
import { SuccessLine } from '@fivvi/ui/kit/success-line';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { setDefaultLocale } from './default-locale-client';

/** The two options, always written in their own language (`packages/i18n/GLOSSARY.md` §4.8). */
const OPTIONS = [
  { locale: 'nl-NL', label: 'optionNl' },
  { locale: 'en', label: 'optionEn' },
] as const satisfies readonly { locale: Locale; label: string }[];

/**
 * TW-08, Settings → Language (F010, Owner only): the workspace's default communication language
 * with *Save*. It decides the language of emails to people without a preference of their own and
 * never what anyone sees on screen, so a save does not change the language of this page.
 */
export function LanguageForm({
  workspaceId,
  defaultLocale,
}: {
  workspaceId: string;
  defaultLocale: Locale;
}) {
  const t = useTranslations('settingsLanguage');
  const tNav = useTranslations('workspaceNav');
  const router = useRouter();
  const [failure, setFailure] = useState<'noConnection' | 'generic' | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  // The button waits for the page to hydrate: a click before that would submit the form natively.
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('defaultLocale');
    const option = OPTIONS.find((candidate) => candidate.locale === value);
    if (!option) return;
    setPending(true);
    setFailure(null);
    setSaved(false);
    const result = await setDefaultLocale(workspaceId, option.locale);
    setPending(false);
    if (result.ok) {
      setSaved(true);
      return router.refresh();
    }
    // Not allowed (any more): the signed-in home knows where this person belongs.
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    setFailure(result.reason);
  }

  const failureMessage = failure ? t(`errors.${failure}`) : null;

  return (
    <PageShell>
      <h1 className="text-xl font-semibold tracking-tight">{tNav('settings')}</h1>
      <Card>
        <form noValidate onSubmit={submit} className="grid gap-(--card-spacing)">
          <CardHeader>
            <CardTitle>
              <h2 className="text-[15px] font-semibold">{t('title')}</h2>
            </CardTitle>
            <CardAction>
              <Button type="submit" disabled={!ready || pending}>
                {t('save')}
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4">
            <fieldset aria-describedby="default-locale-help" className="grid gap-2">
              <legend className="mb-2 text-[13px] font-semibold">{t('defaultLabel')}</legend>
              {OPTIONS.map(({ locale, label }) => (
                <label key={locale} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="defaultLocale"
                    value={locale}
                    defaultChecked={locale === defaultLocale}
                    className="accent-primary"
                  />
                  {t(label)}
                </label>
              ))}
            </fieldset>
            <CardDescription id="default-locale-help" className="text-[13px]">
              {t('help')}
            </CardDescription>
            {failureMessage ? <ErrorLine>{failureMessage}</ErrorLine> : null}
            {saved ? <SuccessLine>{t('saved')}</SuccessLine> : null}
          </CardContent>
        </form>
      </Card>
    </PageShell>
  );
}
