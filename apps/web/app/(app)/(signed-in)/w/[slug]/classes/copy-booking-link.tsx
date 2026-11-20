'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import { Button } from '@fivvi/ui/components/button';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { Toast } from '@fivvi/ui/kit/toast';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { copyDateLinkToClipboard } from './copy-date-link';

/**
 * **Boekingslink kopiëren** on CO-01 (F037): gets or makes the short link of this class date in
 * the visitor's language, puts it on the clipboard and says "Link gekopieerd" in a snackbar
 * announced politely. The Owner and the Trainers have it, on a class date that is scheduled and
 * has not started. A second copy gives the same link.
 */
export function CopyBookingLink({
  workspaceId,
  sessionId,
}: {
  workspaceId: string;
  sessionId: string;
}) {
  const t = useTranslations('bookingLinks');
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<
    'copy' | 'noConnection' | 'generic' | 'noPermission' | null
  >(null);
  const [pending, setPending] = useState(false);
  // The button waits for the page to hydrate: a click before that would do nothing.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8_000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function copy() {
    setPending(true);
    setNotice(null);
    setFailure(null);
    const result = await copyDateLinkToClipboard(workspaceId, sessionId);
    setPending(false);
    if (result.ok) return setNotice(t('copied'));
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    setFailure(result.reason === 'forbidden' ? 'noPermission' : result.reason);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={!ready || pending}
        onClick={() => void copy()}
      >
        {t('copyBooking')}
      </Button>
      {failure ? <ErrorLine className="basis-full">{t(`errors.${failure}`)}</ErrorLine> : null}
      {notice ? <Toast>{notice}</Toast> : null}
    </>
  );
}
