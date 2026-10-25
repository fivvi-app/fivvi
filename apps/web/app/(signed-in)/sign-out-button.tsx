'use client';

import { Button } from '@fivvi/ui/components/button';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { SIGN_IN_PAGE } from '../../lib/return-path';
import { signOut } from './sign-out-client';

/**
 * *Uitloggen* / *Sign out* (F001, AC12): signs out this browser only, then shows the sign-in
 * page. When it fails the person is still signed in and sees why.
 */
export function SignOutButton() {
  const t = useTranslations('signOut');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  // The button waits for the page to hydrate: a click before that would be lost.
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  async function signOutHere() {
    setPending(true);
    setFailed(false);
    const { ok } = await signOut();
    // A full page load, so nothing the router kept from the signed-in pages is shown again.
    if (ok) return window.location.replace(SIGN_IN_PAGE);
    setPending(false);
    setFailed(true);
  }

  return (
    <div className="flex items-center gap-2">
      {failed ? (
        <p role="alert" className="text-sm text-status-danger-fg">
          {t('error')}
        </p>
      ) : null}
      <Button type="button" variant="ghost" disabled={!ready || pending} onClick={signOutHere}>
        {t('label')}
      </Button>
    </div>
  );
}
