'use client';

import { Button } from '@fivvi/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@fivvi/ui/components/card';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { confirmLink, type LinkErrorKey, previewLink } from './link-client';

/** Where a signed-in browser goes until F002 adds workspaces (as for the code). */
const SIGNED_IN_HOME = '/home';

type State =
  | { step: 'checking' }
  | { step: 'ready'; email: string }
  | { step: 'invalid' }
  | { step: 'failed'; error: LinkErrorKey };

/**
 * The confirm step of TW-10: which address the link signs in (masked), and one button. Checking
 * the link on load uses nothing up; the button does. A link that no longer works says so without
 * saying why (expired, used or replaced) and offers a new email.
 */
export function ConfirmForm({ token }: { token: string }) {
  const t = useTranslations('signIn');
  const common = useTranslations('common');
  const router = useRouter();
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
    if (result.ok) return router.replace(SIGNED_IN_HOME);
    setPending(false);
    if (result.error === 'linkInvalid') return setState({ step: 'invalid' });
    setError(result.error);
  }

  if (state.step === 'checking') {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <p role="status">{t('confirmChecking')}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        {state.step === 'ready' ? (
          <>
            <CardHeader>
              <CardTitle className="font-display">
                <h1>{t('confirmTitle', { email: state.email })}</h1>
              </CardTitle>
            </CardHeader>
            {error ? (
              <CardContent>
                <p role="alert" className="text-status-danger-fg">
                  {t(`errors.${error}`)}
                </p>
              </CardContent>
            ) : null}
            <CardFooter>
              <Button type="button" disabled={pending} onClick={signIn}>
                {t('confirmSubmit')}
              </Button>
            </CardFooter>
          </>
        ) : state.step === 'invalid' ? (
          <>
            <CardHeader>
              <CardTitle className="font-display">
                <h1>{t('linkInvalidTitle')}</h1>
              </CardTitle>
              <CardDescription>{t('linkInvalidBody')}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button asChild>
                <Link href="/login">{t('linkInvalidRequest')}</Link>
              </Button>
            </CardFooter>
          </>
        ) : (
          <>
            <CardContent>
              <p role="alert" className="text-status-danger-fg">
                {t(`errors.${state.error}`)}
              </p>
            </CardContent>
            <CardFooter>
              <Button type="button" onClick={() => setAttempt((n) => n + 1)}>
                {common('retry')}
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </main>
  );
}
