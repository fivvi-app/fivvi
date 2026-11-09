'use client';

import { Button } from '@fivvi/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@fivvi/ui/components/card';
import { WarningIcon } from '@fivvi/ui/kit/icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { SignInMark } from '../sign-in-mark';
import { confirmLink, type LinkErrorKey, previewLink } from './link-client';

type State =
  | { step: 'checking' }
  | { step: 'ready'; email: string }
  | { step: 'invalid' }
  | { step: 'failed'; error: LinkErrorKey };

/**
 * The confirm step of TW-10: which address the link signs in (masked), and one button. Checking
 * the link on load uses nothing up; the button does. A link that no longer works says so without
 * saying why (expired, used or replaced) and offers a new email. `returnPath` is the page sign-in
 * ends at: a path of this site (`safeReturnPath`), never another address.
 */
export function ConfirmForm({ token, returnPath }: { token: string; returnPath: string }) {
  const t = useTranslations('signIn');
  const common = useTranslations('common');
  const [state, setState] = useState<State>({ step: 'checking' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<LinkErrorKey | null>(null);
  // Bumped by "try again" after the check could not reach the server.
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the check on retry.
  useEffect(() => {
    let current = true;
    setState({ step: 'checking' });
    if (!token) {
      setState({ step: 'invalid' });
      return;
    }
    void previewLink(token).then((result) => {
      if (!current) return;
      if (result.ok) setState({ step: 'ready', email: result.email });
      else if (result.error === 'linkInvalid') setState({ step: 'invalid' });
      else setState({ step: 'failed', error: result.error });
    });
    return () => {
      current = false;
    };
  }, [token, attempt]);

  async function signIn() {
    setPending(true);
    setError(null);
    const result = await confirmLink(token);
    if (result.ok) return window.location.replace(returnPath);
    setPending(false);
    if (result.error === 'linkInvalid') return setState({ step: 'invalid' });
    setError(result.error);
  }

  if (state.step === 'checking') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-sidebar p-6">
        <p role="status">{t('confirmChecking')}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-sidebar p-6">
      <Card className="w-full max-w-100 shadow-xs [--card-spacing:--spacing(5)]">
        {state.step === 'ready' ? (
          <>
            <CardHeader className="justify-items-center gap-3 text-center">
              <SignInMark />
              <CardTitle className="text-[22px] leading-tight font-semibold">
                <h1>{t('confirmTitle', { email: state.email })}</h1>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {error ? <ErrorMessage message={t(`errors.${error}`)} /> : null}
              <Button type="button" disabled={pending} onClick={signIn} className="w-full">
                {t('confirmSubmit')}
              </Button>
            </CardContent>
          </>
        ) : state.step === 'invalid' ? (
          <>
            <CardHeader className="justify-items-center gap-3 text-center">
              <SignInMark />
              <CardTitle className="text-[22px] leading-tight font-semibold">
                <h1>{t('linkInvalidTitle')}</h1>
              </CardTitle>
              <CardDescription>{t('linkInvalidBody')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/login">{t('linkInvalidBack')}</Link>
              </Button>
            </CardContent>
          </>
        ) : (
          <CardContent className="grid gap-4">
            <ErrorMessage message={t(`errors.${state.error}`)} />
            <Button type="button" onClick={() => setAttempt((n) => n + 1)} className="w-full">
              {common('retry')}
            </Button>
          </CardContent>
        )}
      </Card>
    </main>
  );
}

/** A refusal in words, with the warning icon, announced when it appears. */
function ErrorMessage({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-center gap-1.5 text-[13px] font-semibold text-status-danger-fg"
    >
      <WarningIcon className="size-3.5 shrink-0" />
      {message}
    </p>
  );
}
