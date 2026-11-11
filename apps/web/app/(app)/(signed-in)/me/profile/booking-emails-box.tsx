'use client';

import { SIGN_IN_PAGE } from '@fivvi/auth/return-path';
import { Card, CardContent, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { Label } from '@fivvi/ui/components/label';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { saveBookingEmails } from './booking-emails-client';

/**
 * The section *E-mails* of TW-09 (F050): the checkbox *E-mails over boekingen in mijn lessen*.
 * A change is saved at once; if it fails the box goes back and says why. The setting belongs to
 * the account (the same in every workspace), and the page's other fields are not touched by it.
 * After a save the page asks the server again, so it shows what the API holds.
 */
export function BookingEmailsBox({ bookingEmails }: { bookingEmails: boolean }) {
  const t = useTranslations('myProfile');
  const router = useRouter();
  const id = useId();
  const [on, setOn] = useState(bookingEmails);
  const [failure, setFailure] = useState<'noConnection' | 'generic' | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  // The box waits for the page to hydrate: a click before that would change nothing.
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);
  // The server holds the truth: after a refresh the box shows what the API says.
  useEffect(() => setOn(bookingEmails), [bookingEmails]);

  async function change(next: boolean) {
    setPending(true);
    setFailure(null);
    setSaved(false);
    setOn(next);
    const result = await saveBookingEmails(next);
    setPending(false);
    if (result.ok) {
      setSaved(true);
      return router.refresh();
    }
    setOn(!next);
    if (result.reason === 'signedOut') return window.location.replace(SIGN_IN_PAGE);
    setFailure(result.reason);
  }

  const describedBy = failure ? `${id}-help ${id}-error` : `${id}-help`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-[15px] font-semibold">{t('emailsTitle')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1">
        <div className="flex items-center gap-3">
          <input
            id={id}
            type="checkbox"
            className="size-5 accent-primary"
            checked={on}
            disabled={!ready || pending}
            aria-describedby={describedBy}
            onChange={(event) => void change(event.target.checked)}
          />
          <Label htmlFor={id}>{t('bookingEmailsLabel')}</Label>
        </div>
        <p id={`${id}-help`} className="text-sm text-muted-foreground">
          {t('bookingEmailsHelp')}
        </p>
        {failure ? <ErrorLine id={`${id}-error`}>{t(`errors.${failure}`)}</ErrorLine> : null}
        {saved ? (
          <p role="status" className="text-sm font-semibold text-status-success-text">
            {t('saved')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
