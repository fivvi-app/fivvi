'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import type { Locale } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@fivvi/ui/components/dialog';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { cancelPrivateSession } from './cancel-client';
import type { Session } from './sessions-client';
import { useSessionFormat } from './use-session-format';

/** The client of the session, as far as cancelling it needs: the name, the address and the language of the email. */
export interface CancelledClient {
  name: string;
  email: string;
  emailLocale: Locale | null;
}

type Initiator = 'client' | 'workspace';
type Failure =
  | { kind: 'changed'; by: string | null }
  | { kind: 'cancelled' }
  | { kind: 'noPermission' }
  | { kind: 'notSaved' };

/**
 * PS-06 *Sessie annuleren?* (F026): the button *Annuleren* of the session page and the dialog it
 * opens. *Wie annuleert?* is *De klant* (the default, email off) or *Wij* (email on). With *De
 * klant* the dialog first asks "Al een ander moment voorgesteld?": **Verplaatsen** opens PS-05 and
 * nothing is cancelled, *Toch annuleren* shows the confirm step; with *Wij* the dialog goes straight
 * to it. A session that has started has no email box and sends nothing. After the cancellation the
 * page asks the server again; the line "Sessie geannuleerd." stays here, because the button goes.
 */
export function CancelSession({
  workspaceId,
  session,
  client,
  defaultLocale,
  open,
  onOpenChange,
  onReschedule,
}: {
  workspaceId: string;
  session: Session;
  client: CancelledClient;
  /** The workspace's default language for emails. */
  defaultLocale: Locale;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** *Verplaatsen* of the nudge: opens PS-05 for the same session. */
  onReschedule: () => void;
}) {
  const t = useTranslations('sessions.cancel');
  const [done, setDone] = useState(false);
  // The buttons wait for the page to hydrate: a click before that would do nothing.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <>
      {session.status === 'scheduled' ? (
        <Button
          type="button"
          variant="outline"
          disabled={!ready}
          onClick={() => onOpenChange(true)}
        >
          {t('action')}
        </Button>
      ) : null}
      {done ? (
        <p
          role="status"
          className="rounded-lg bg-status-success-bg px-3 py-2 text-sm font-semibold text-status-success-text"
        >
          {t('done')}
        </p>
      ) : null}
      <Dialog open={open} onOpenChange={onOpenChange}>
        {open ? (
          <CancelForm
            workspaceId={workspaceId}
            session={session}
            client={client}
            defaultLocale={defaultLocale}
            close={() => onOpenChange(false)}
            reschedule={() => {
              onOpenChange(false);
              onReschedule();
            }}
            cancelled={() => {
              onOpenChange(false);
              setDone(true);
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function CancelForm({
  workspaceId,
  session,
  client,
  defaultLocale,
  close,
  reschedule,
  cancelled,
}: {
  workspaceId: string;
  session: Session;
  client: CancelledClient;
  defaultLocale: Locale;
  close: () => void;
  reschedule: () => void;
  cancelled: () => void;
}) {
  const t = useTranslations('sessions.cancel');
  const form = useTranslations('sessions.form');
  const router = useRouter();
  const { day, time } = useSessionFormat(session.timeZone);
  // The session as the person saw it; a 409 replaces it with the session as it is now.
  const [current, setCurrent] = useState(session);
  const [initiator, setInitiator] = useState<Initiator>('client');
  // *Toch annuleren* of the nudge: the confirm step is shown. *Wij* needs no nudge.
  const [confirming, setConfirming] = useState(false);
  const [notify, setNotify] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  const started = new Date(current.startsAt) <= new Date();
  const step = initiator === 'workspace' || confirming ? 'confirm' : 'nudge';
  const language =
    (client.emailLocale ?? defaultLocale) === 'en' ? form('languageEn') : form('languageNl');

  function choose(next: Initiator) {
    setInitiator(next);
    // The box follows who cancels: off for the client's own cancellation, on when we cancel.
    setNotify(next === 'workspace');
    setFailure(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFailure(null);
    const result = await cancelPrivateSession(workspaceId, current.id, {
      initiator,
      // A session that has started sends nothing, whatever the box said.
      notify: notify && !started,
      version: current.version,
    });
    if (result.ok) {
      router.refresh();
      return cancelled();
    }
    setPending(false);
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    if (result.reason === 'conflict') {
      setCurrent(result.session);
      if (result.code === 'session_cancelled') router.refresh();
      return setFailure(
        result.code === 'session_cancelled'
          ? { kind: 'cancelled' }
          : { kind: 'changed', by: result.changedBy ?? null },
      );
    }
    setFailure({ kind: result.reason === 'forbidden' ? 'noPermission' : 'notSaved' });
  }

  const message =
    failure?.kind === 'changed'
      ? failure.by
        ? t('changedBy', { name: failure.by })
        : t('changedByUnknown')
      : failure?.kind === 'cancelled'
        ? t('alreadyCancelled')
        : failure?.kind === 'noPermission'
          ? t('noPermission')
          : failure?.kind === 'notSaved'
            ? form('errors.notSaved')
            : null;

  return (
    <DialogContent
      aria-describedby="cancel-session-description"
      className="gap-0 rounded-[14px] p-5.5 sm:max-w-115"
    >
      <form noValidate onSubmit={submit} className="grid gap-4">
        <DialogHeader>
          <DialogTitle className="text-lg leading-snug font-semibold">{t('title')}</DialogTitle>
          <DialogDescription id="cancel-session-description">
            {t('subtitle', {
              client: client.name,
              date: day(current.startsAt),
              start: time(current.startsAt),
              end: time(current.endsAt),
            })}
          </DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{t('whoLabel')}</legend>
          {(['client', 'workspace'] as const).map((option) => (
            <label key={option} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="initiator"
                value={option}
                checked={initiator === option}
                onChange={() => choose(option)}
                className="size-4 accent-primary"
              />
              {option === 'client' ? t('whoClient') : t('whoUs')}
            </label>
          ))}
        </fieldset>
        {step === 'nudge' ? (
          <div className="grid gap-3">
            <p className="text-sm font-medium">{t('nudgeQuestion')}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={reschedule}>
                {t('nudgeReschedule')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
                {t('nudgeCancelAnyway')}
              </Button>
            </div>
          </div>
        ) : started ? (
          <p className="text-sm">{t('started')}</p>
        ) : (
          <div className="grid gap-0.5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="notify"
                className="size-4 accent-primary"
                checked={notify}
                onChange={(event) => setNotify(event.target.checked)}
              />
              {t('notify', { client: client.name })}
            </label>
            <p className="pl-6 text-[13px] text-muted-foreground">
              {t('notifyNote', { email: client.email, language })}
            </p>
          </div>
        )}
        {message ? <ErrorLine>{message}</ErrorLine> : null}
        <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0 pt-2">
          <Button type="button" variant="outline" onClick={close}>
            {t('back')}
          </Button>
          {step === 'confirm' ? (
            <Button type="submit" variant="destructive" disabled={pending}>
              {t('submit')}
            </Button>
          ) : null}
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
