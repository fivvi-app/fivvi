'use client';

import { SIGN_IN_PAGE } from '@fivvi/auth/return-path';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { PillButton } from '@fivvi/ui/kit/pill-button';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { signOut } from '../../(signed-in)/sign-out-client';

/**
 * *Uitloggen* / *Sign out* on *Profiel* (F030, F001 AC12): signs out this browser only, then shows
 * the sign-in page. When it fails the person is still signed in and sees why.
 */
export function ClientSignOut() {
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
    <div className="grid gap-3">
      {failed ? <ErrorLine>{t('error')}</ErrorLine> : null}
      <PillButton
        variant="tonal"
        className="w-full"
        disabled={!ready || pending}
        onClick={signOutHere}
      >
        {t('label')}
      </PillButton>
    </div>
  );
}
