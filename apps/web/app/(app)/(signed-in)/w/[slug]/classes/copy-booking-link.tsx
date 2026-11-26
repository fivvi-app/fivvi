'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import { Button } from '@fivvi/ui/components/button';
import { Input } from '@fivvi/ui/components/input';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { ShareIcon } from '@fivvi/ui/kit/icons';
import { Toast } from '@fivvi/ui/kit/toast';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { copyDateLinkToClipboard } from './copy-date-link';

/**
 * **Boekingslink kopiëren** on CO-01 (F037): gets or makes the short link of this class date in
 * the visitor's language, puts it on the clipboard and says "Link gekopieerd" in a snackbar
 * announced politely. The Owner and the Trainers have it, on a class date that is scheduled and
 * has not started. A second copy gives the same link.
 *
 * The same code serves the Agenda's quick view (WC-05): there `variant="icon"` shows the button as
 * a share icon only, named (and given its tooltip) by the same words.
 */
export function CopyBookingLink({
  workspaceId,
  sessionId,
  variant = 'text',
}: {
  workspaceId: string;
  sessionId: string;
  variant?: 'text' | 'icon';
}) {
  const t = useTranslations('bookingLinks');
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<
    'copy' | 'noConnection' | 'generic' | 'noPermission' | null
  >(null);
  // The link, shown to select by hand when the clipboard refused although the request worked.
  const [shownUrl, setShownUrl] = useState<string | null>(null);
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
    setShownUrl(null);
    const result = await copyDateLinkToClipboard(workspaceId, sessionId);
    setPending(false);
    if (result.ok) return setNotice(t('copied'));
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    if (result.reason === 'copy') setShownUrl(result.url ?? null);
    setFailure(result.reason === 'forbidden' ? 'noPermission' : result.reason);
  }

  return (
    <>
      {variant === 'icon' ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t('copyBooking')}
          title={t('copyBooking')}
          disabled={!ready || pending}
          onClick={() => void copy()}
        >
          <ShareIcon />
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={!ready || pending}
          onClick={() => void copy()}
        >
          {t('copyBooking')}
        </Button>
      )}
      {failure ? <ErrorLine className="basis-full">{t(`errors.${failure}`)}</ErrorLine> : null}
      {shownUrl ? (
        <Input
          readOnly
          value={shownUrl}
          aria-label={t('linkLabel')}
          data-testid="booking-link-url"
          className="basis-full"
          onFocus={(event) => event.currentTarget.select()}
        />
      ) : null}
      {notice ? <Toast>{notice}</Toast> : null}
    </>
  );
}
