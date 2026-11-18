'use client';

import { loginPath } from '@fivvi/auth/return-path';
import { Button } from '@fivvi/ui/components/button';
import { CardContent, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { signOut } from '../../(signed-in)/sign-out-client';
import { GatePage } from '../../gate-page';
import { answerInvitation, type InvitationAnswer } from './invitation-client';

/** What the page says: the question, the wrong account, the neutral "no longer valid" or the end. */
export type InvitationView =
  | {
      kind: 'question';
      workspaceName: string;
      /** The Owner's name; `null` while they have given none. */
      inviterName: string | null;
      maskedEmail: string;
    }
  | { kind: 'wrongAccount'; maskedEmail: string }
  | { kind: 'noLongerValid' }
  | { kind: 'declined' };

/**
 * The invitation page (`/invitations/{token}`, F011): for a person signed in with the address the
 * invitation is for, *{inviter} nodigt je uit om trainer te worden bij {workspace}.* with
 * *Accepteren* and *Afwijzen*; for any other account the masked address and *Uitloggen en verder*;
 * for an invitation that is expired, withdrawn, used or unknown, one neutral text. The server
 * decides the first view; the API has the last word on every answer, so a 403 or 404 changes the
 * view too. Accepting opens the workspace; declining ends on one line.
 */
export function InvitationCard({ token, initial }: { token: string; initial: InvitationView }) {
  const t = useTranslations('invitation');
  const [view, setView] = useState<InvitationView>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'noConnection' | 'generic' | null>(null);
  // The buttons wait for the page to hydrate: a click before that would be lost.
  const [ready, setReady] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const signOutError = useTranslations('signOut');

  useEffect(() => setReady(true), []);

  const here = `/invitations/${encodeURIComponent(token)}`;

  async function answer(which: InvitationAnswer) {
    if (view.kind !== 'question') return;
    setPending(true);
    setError(null);
    const result = await answerInvitation(token, which);
    if (result.ok) {
      // A full page load, so the workspace is asked for with everything the new role allows.
      if (result.answer === 'accept') return window.location.replace(`/w/${result.slug}`);
      setPending(false);
      return setView({ kind: 'declined' });
    }
    if (result.reason === 'signIn') return window.location.replace(loginPath(here, ''));
    setPending(false);
    if (result.reason === 'wrongAccount') {
      return setView({ kind: 'wrongAccount', maskedEmail: view.maskedEmail });
    }
    if (result.reason === 'noLongerValid') return setView({ kind: 'noLongerValid' });
    setError(result.reason);
  }

  async function signOutAndContinue() {
    setPending(true);
    setSignOutFailed(false);
    const { ok } = await signOut();
    // A full page load: the invitation page then sends a signed-out visitor to sign in.
    if (ok) return window.location.replace(here);
    setPending(false);
    setSignOutFailed(true);
  }

  return (
    <GatePage standalone>
      <CardHeader className="gap-3 text-center">
        <CardTitle className="text-[22px] leading-tight font-semibold">
          <h1>{t('title')}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {view.kind === 'question' ? (
          <>
            <p>
              {view.inviterName
                ? t('intro', { inviter: view.inviterName, workspace: view.workspaceName })
                : t('introAnonymous', { workspace: view.workspaceName })}
            </p>
            {error ? <ErrorLine>{t(`errors.${error}`)}</ErrorLine> : null}
            <div className="grid gap-2">
              <Button type="button" disabled={!ready || pending} onClick={() => answer('accept')}>
                {t('accept')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!ready || pending}
                onClick={() => answer('decline')}
              >
                {t('decline')}
              </Button>
            </div>
          </>
        ) : null}
        {view.kind === 'wrongAccount' ? (
          <>
            <p>{t('wrongAccount', { maskedEmail: view.maskedEmail })}</p>
            {signOutFailed ? <ErrorLine>{signOutError('error')}</ErrorLine> : null}
            <Button
              type="button"
              variant="outline"
              disabled={!ready || pending}
              onClick={signOutAndContinue}
            >
              {t('signOutAndContinue')}
            </Button>
          </>
        ) : null}
        {view.kind === 'noLongerValid' ? <p>{t('noLongerValid')}</p> : null}
        {view.kind === 'declined' ? <p role="status">{t('declined')}</p> : null}
      </CardContent>
    </GatePage>
  );
}
