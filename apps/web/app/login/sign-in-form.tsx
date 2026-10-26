'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import type { Locale } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@fivvi/ui/components/card';
import { Input } from '@fivvi/ui/components/input';
import { Label } from '@fivvi/ui/components/label';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { requestCode, type SignInErrorKey, verifyCode } from './sign-in-client';

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
    const result = await requestCode(entered, locale, returnPath);
    setPending(false);
    if (!result.ok) return setError(result.error);
    setStep('code');
  }

  async function sendNewEmail() {
    setPending(true);
    setError(null);
    setResent(false);
    const result = await requestCode(email, locale, returnPath);
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
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        {step === 'email' ? (
          <form noValidate onSubmit={sendEmail} className="grid gap-(--card-spacing)">
            <CardHeader>
              <CardTitle className="font-display">
                <h1>{t('title')}</h1>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Label htmlFor="email">{t('emailLabel')}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={email}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'sign-in-error' : undefined}
              />
              <FieldError message={errorMessage} />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={disabled}>
                {t('sendCode')}
              </Button>
            </CardFooter>
          </form>
        ) : (
          <form noValidate onSubmit={signIn} className="grid gap-(--card-spacing)">
            <CardHeader>
              <CardTitle className="font-display">
                <h1>{t('checkEmailTitle')}</h1>
              </CardTitle>
              <CardDescription>{t('checkEmailBody', { email })}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Label htmlFor="code">{t('codeLabel')}</Label>
              <p id="code-help" className="text-sm text-muted-foreground">
                {t('codeHelp')}
              </p>
              <Input
                id="code"
                name="code"
                ref={codeField}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'code-help sign-in-error' : 'code-help'}
              />
              <FieldError message={errorMessage} />
              {resent ? <p role="status">{t('resent', { email })}</p> : null}
            </CardContent>
            <CardFooter className="flex-wrap gap-2">
              <Button type="submit" disabled={disabled}>
                {t('submitCode')}
              </Button>
              <Button type="button" variant="ghost" disabled={disabled} onClick={sendNewEmail}>
                {t('resend')}
              </Button>
              <Button type="button" variant="ghost" disabled={disabled} onClick={changeEmail}>
                {t('changeEmail')}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </main>
  );
}

/** The message under a field that was refused, announced when it appears. */
function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p id="sign-in-error" role="alert" className="text-status-danger-fg">
      {message}
    </p>
  );
}

/** What was typed in the form's field `name`, without surrounding spaces. */
function field(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);
  return typeof value === 'string' ? value.trim() : '';
}
