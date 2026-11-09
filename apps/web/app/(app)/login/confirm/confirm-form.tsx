'use client';

import { Button } from '@fivvi/ui/components/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { GatePage } from '../../gate-page';
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
      <GatePage standalone>
        <CardContent>
          <p role="status" className="text-center">
            {t('confirmChecking')}
          </p>
        </CardContent>
      </GatePage>
    );
  }

  return (
    <GatePage standalone>
      {state.step === 'ready' ? (
        <>
          <CardHeader className="justify-items-center gap-3 text-center">
            <SignInMark />
            <CardTitle className="text-[22px] leading-tight font-semibold">
              <h1>{t('confirmTitle', { email: state.email })}</h1>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {error ? <ErrorLine>{t(`errors.${error}`)}</ErrorLine> : null}
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
          <ErrorLine>{t(`errors.${state.error}`)}</ErrorLine>
          <Button type="button" onClick={() => setAttempt((n) => n + 1)} className="w-full">
            {common('retry')}
          </Button>
        </CardContent>
      )}
    </GatePage>
  );
}
