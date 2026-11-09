'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import type { Locale } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@fivvi/ui/components/card';
import { Field } from '@fivvi/ui/kit/field';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { LanguageSwitch } from './language-switch';
import { requestCode, type SignInErrorKey, verifyCode } from './sign-in-client';
import { SignInMark } from './sign-in-mark';

/**
 * TW-10: the email step, then the code step on the same screen. `locale` is the language of the
 * page, which the email is written in unless the account stores another (ADR-019). What each
 * request answers is the same for every address, so nothing here reveals who has an account.
 * `returnPath` is the page asked for before sign-in: a path of this site (`safeReturnPath`), never
 * another address, or `undefined` when none was. Signing in with the code ends there (else at the
 * signed-in home), and it goes with the email request, so the emailed link ends there too (#207).
 */
export function SignInForm({ locale, returnPath }: { locale: Locale; returnPath?: string }) {
  const t = useTranslations('signIn');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<SignInErrorKey | null>(null);
  const [resent, setResent] = useState(false);
  const [pending, setPending] = useState(false);
  // The buttons wait for the page to hydrate: a click before that would submit the form natively
  // and reload the page, and a value typed before it would be lost.
  const [ready, setReady] = useState(false);
  const codeField = useRef<HTMLInputElement>(null);

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (step === 'code') codeField.current?.focus();
  }, [step]);

  async function sendEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entered = field(event.currentTarget, 'email');
    setEmail(entered);
    setPending(true);
    setError(null);
    const result = await requestCode(entered, locale, { returnTo: returnPath });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setStep('code');
  }

  async function sendNewEmail() {
    setPending(true);
    setError(null);
    setResent(false);
    const result = await requestCode(email, locale, { returnTo: returnPath });
    setPending(false);
    if (!result.ok) return setError(result.error);
    // The new code replaces the old one, so the old entry is of no use.
    if (codeField.current) codeField.current.value = '';
    setResent(true);
    codeField.current?.focus();
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setResent(false);
    const result = await verifyCode(email, field(event.currentTarget, 'code'));
    // A full page load, so the page is asked for with the new cookie and nothing the router kept
    // from before sign-in (a redirect to this page) is reused.
    if (result.ok) return window.location.replace(returnPath ?? SIGNED_IN_HOME);
    setPending(false);
    setError(result.error);
  }

  function changeEmail() {
    setStep('email');
    setError(null);
    setResent(false);
  }

  const errorMessage = error ? t(`errors.${error}`) : null;
  const disabled = !ready || pending;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-sidebar p-6">
      <div className="flex w-full max-w-100 justify-end">
        <LanguageSwitch />
      </div>
      <Card className="w-full max-w-100 shadow-xs [--card-spacing:--spacing(5)]">
        {step === 'email' ? (
          <form noValidate onSubmit={sendEmail} className="grid gap-(--card-spacing)">
            <CardHeader className="justify-items-center gap-3 text-center">
              <SignInMark />
              <CardTitle className="text-[22px] leading-tight font-semibold">
                <h1>{t('title')}</h1>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={email}
                label={t('emailLabel')}
                error={errorMessage}
              />
              <div className="grid gap-2">
                <Button type="submit" disabled={disabled} className="w-full">
                  {t('sendCode')}
                </Button>
              </div>
            </CardContent>
          </form>
        ) : (
          <form noValidate onSubmit={signIn} className="grid gap-(--card-spacing)">
            <CardHeader className="justify-items-center gap-3 text-center">
              <SignInMark />
              <CardTitle className="text-[22px] leading-tight font-semibold">
                <h1>{t('checkEmailTitle')}</h1>
              </CardTitle>
              <CardDescription>{t('checkEmailBody', { email })}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field
                id="code"
                name="code"
                ref={codeField}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                label={t('codeLabel')}
                hint={t('codeHelp')}
                error={errorMessage}
              />
              {resent ? (
                <p role="status" className="text-center text-sm text-muted-foreground">
                  {t('resent', { email })}
                </p>
              ) : null}
              <div className="grid gap-2">
                <Button type="submit" disabled={disabled} className="w-full">
                  {t('submitCode')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled}
                  onClick={sendNewEmail}
                  className="w-full"
                >
                  {t('resend')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled}
                  onClick={changeEmail}
                  className="w-full"
                >
                  {t('changeEmail')}
                </Button>
              </div>
            </CardContent>
          </form>
        )}
      </Card>
    </main>
  );
}

/** What was typed in the form's field `name`, without surrounding spaces. */
function field(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);
  return typeof value === 'string' ? value.trim() : '';
}
