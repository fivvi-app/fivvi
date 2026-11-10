'use client';

import { SIGN_IN_PAGE } from '@fivvi/auth/return-path';
import { Label } from '@fivvi/ui/components/label';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { setTrainsHere } from './trains-here-client';

/**
 * The switch *Ik geef zelf ook trainingen in John's Gym* of TW-09 (F005), for a workspace where
 * the person is Owner. A change is saved at once; if it fails the switch goes back and says why.
 * After a save the page asks the server again, so every page shows who trains. The wording talks
 * about training, not about trainer profiles.
 */
export function TrainsHereSwitch({
  workspaceId,
  workspaceName,
  trainsHere,
}: {
  workspaceId: string;
  workspaceName: string;
  trainsHere: boolean;
}) {
  const t = useTranslations('profile.trainsHere');
  const router = useRouter();
  const id = useId();
  const [trains, setTrains] = useState(trainsHere);
  const [failure, setFailure] = useState<'noConnection' | 'generic' | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  // The switch waits for the page to hydrate: a click before that would change nothing.
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);
  // The server holds the truth: after a refresh the switch shows what the API says.
  useEffect(() => setTrains(trainsHere), [trainsHere]);

  async function change(next: boolean) {
    setPending(true);
    setFailure(null);
    setSaved(false);
    setTrains(next);
    const result = await setTrainsHere(workspaceId, next);
    setPending(false);
    if (result.ok) {
      setSaved(true);
      return router.refresh();
    }
    setTrains(!next);
    if (result.reason === 'signedOut') return window.location.replace(SIGN_IN_PAGE);
    setFailure(result.reason);
    // A refused change (a role that changed meanwhile): show what the API holds now.
    if (result.reason === 'generic') router.refresh();
  }

  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="checkbox"
          role="switch"
          aria-checked={trains}
          className="size-5 accent-primary"
          checked={trains}
          disabled={!ready || pending}
          aria-describedby={failure ? `${id}-error` : undefined}
          onChange={(event) => void change(event.target.checked)}
        />
        <Label htmlFor={id}>{t('label', { workspace: workspaceName })}</Label>
      </div>
      {failure ? <ErrorLine id={`${id}-error`}>{t(`errors.${failure}`)}</ErrorLine> : null}
      {saved ? (
        <p role="status" className="text-sm font-semibold text-status-success-text">
          {t('saved')}
        </p>
      ) : null}
    </div>
  );
}
