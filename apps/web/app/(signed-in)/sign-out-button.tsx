'use client';

import { Button } from '@fivvi/ui/components/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { signOut } from './sign-out-client';

/**
 * *Uitloggen* / *Sign out* (F001, AC12): signs out this browser only, then shows the sign-in
 * page. When it fails the person is still signed in and sees why.
 */
export function SignOutButton() {
  const t = useTranslations('signOut');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOutHere() {
    setPending(true);
    setFailed(false);
    const { ok } = await signOut();
    // A full page load, so nothing the router kept from the signed-in pages is shown again.
    if (ok) return window.location.replace('/login');
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
      <Button type="button" variant="ghost" disabled={pending} onClick={signOutHere}>
        {t('label')}
      </Button>
    </div>
  );
}
