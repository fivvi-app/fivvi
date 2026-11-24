'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import { pickContentLanguage } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@fivvi/ui/components/dialog';
import { Textarea } from '@fivvi/ui/components/textarea';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import {
  type CancelledClassDate,
  type ClassCancellationPreview,
  cancelClassDate,
  loadCancelPreview,
} from '../sessions/cancel-client';
import { useSessionFormat } from '../sessions/use-session-format';
import type { Session } from './classes-client';

/** The longest message to the participants the API takes. */
const MESSAGE_LIMIT = 500;

type Scope = 'this' | 'following';
type Failure =
  | { kind: 'changed'; by: string | null }
  | { kind: 'cancelled' }
  | { kind: 'noPermission' }
  | { kind: 'loadFailed' }
  | { kind: 'notSaved' };

/** What cancelling reaches for a scope: the people who get the email and the dates that have one. */
export function reachOf(
  preview: Pick<ClassCancellationPreview, 'thisDate' | 'following'>,
  scope: Scope,
) {
  const counts = scope === 'following' && preview.following ? preview.following : preview.thisDate;
  return { participants: counts.participants, classes: counts.datesWithEmails };
}

/**
 * CO-03 *Les annuleren?* (F026, the Owner): the button *Les annuleren* of CO-01 and the dialog it
 * opens. *Alleen deze les* or, for a date in a series, *Deze en alle volgende lessen (de reeks
 * stopt)*; the line says how many participants get the email (the API's preview), and an optional
 * message goes to them as typed. A date that has started is recorded without emails and without the
 * message field. After the cancellation the page asks the server again; the line that says what
 * happened stays here, because the button goes.
 */
export function CancelClass({
  workspaceId,
  session,
  startOpen = false,
}: {
  workspaceId: string;
  session: Session;
  /** The dialog is open from the start (`?cancel=1`: the calendar's quick view). */
  startOpen?: boolean;
}) {
  const t = useTranslations('classes.cancel');
  const locale = useLocale();
  const { day } = useSessionFormat(session.timeZone);
  const [open, setOpen] = useState(startOpen && session.status === 'scheduled');
  const [done, setDone] = useState<CancelledClassDate | null>(null);
  // The buttons wait for the page to hydrate: a click before that would do nothing.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const name = session.groupClass
    ? pickContentLanguage(locale, session.groupClass.nameNl, session.groupClass.nameEn)
    : '';

  return (
    <>
      {session.status === 'scheduled' ? (
        <Button type="button" variant="outline" disabled={!ready} onClick={() => setOpen(true)}>
          {t('action')}
        </Button>
      ) : null}
      {done ? (
        <p
          role="status"
          className="rounded-lg bg-status-success-bg px-3 py-2 text-sm font-semibold text-status-success-text"
        >
          {t('done', { class: name, date: day(done.session.startsAt) })}{' '}
          {done.participantsNotified > 0
            ? t('doneNotified', { count: done.participantsNotified })
            : null}
        </p>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <CancelForm
            workspaceId={workspaceId}
            session={session}
            name={name}
            close={() => setOpen(false)}
            cancelled={(result) => {
              setOpen(false);
              setDone(result);
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
  name,
  close,
  cancelled,
}: {
  workspaceId: string;
  session: Session;
  name: string;
  close: () => void;
  cancelled: (result: CancelledClassDate) => void;
}) {
  const t = useTranslations('classes.cancel');
  const router = useRouter();
  const { day, time } = useSessionFormat(session.timeZone);
  // The date as the person saw it; a 409 replaces it with the date as it is now.
  const [current, setCurrent] = useState(session);
  const [preview, setPreview] = useState<ClassCancellationPreview | null>(null);
  const [scope, setScope] = useState<Scope>('this');
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);

  // What cancelling reaches is the API's to say, read each time the dialog opens.
  useEffect(() => {
    let active = true;
    void loadCancelPreview(workspaceId, session.id).then((result) => {
      if (!active) return;
      if (result.ok) return setPreview(result.preview);
      if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
      setFailure({
        kind:
          result.reason === 'cancelled'
            ? 'cancelled'
            : result.reason === 'forbidden'
              ? 'noPermission'
              : 'loadFailed',
      });
    });
    return () => {
      active = false;
    };
  }, [workspaceId, session.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview) return;
    setPending(true);
    setFailure(null);
    const result = await cancelClassDate(workspaceId, current.id, {
      scope,
      version: current.version,
      // A date that has started has no message field.
      ...(preview.started ? {} : { message }),
    });
    if (result.ok) {
      router.refresh();
      return cancelled(result);
    }
    setPending(false);
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    if (result.reason === 'conflict') {
      setCurrent(result.session);
      router.refresh();
      return setFailure(
        result.code === 'session_cancelled'
          ? { kind: 'cancelled' }
          : { kind: 'changed', by: result.changedBy ?? null },
      );
    }
    setFailure({ kind: result.reason === 'forbidden' ? 'noPermission' : 'notSaved' });
  }

  const reach = preview ? reachOf(preview, scope) : null;
  const countLine = !preview
    ? null
    : preview.started
      ? t('started')
      : reach && reach.participants === 0
        ? t('countNone')
        : reach && scope === 'following'
          ? t('countFollowing', {
              participants: reach.participants,
              classes: t('classCount', { count: reach.classes }),
            })
          : reach
            ? t('countThis', { participants: reach.participants })
            : null;
  const problem =
    failure?.kind === 'changed'
      ? failure.by
        ? t('changedBy', { name: failure.by })
        : t('changedByUnknown')
      : failure?.kind === 'cancelled'
        ? t('alreadyCancelled')
        : failure?.kind === 'noPermission'
          ? t('noPermission')
          : failure?.kind === 'loadFailed'
            ? t('loadFailed')
            : failure?.kind === 'notSaved'
              ? t('notSaved')
              : null;

  return (
    <DialogContent
      aria-describedby="cancel-class-description"
      className="gap-0 rounded-[14px] p-5.5 sm:max-w-115"
    >
      <form noValidate onSubmit={submit} className="grid gap-4">
        <DialogHeader>
          <DialogTitle className="text-lg leading-snug font-semibold">{t('title')}</DialogTitle>
          <DialogDescription id="cancel-class-description">
            {t('subtitle', {
              class: name,
              date: day(current.startsAt),
              start: time(current.startsAt),
              end: time(current.endsAt),
            })}
          </DialogDescription>
        </DialogHeader>
        {preview?.inSeries ? (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t('scopeLabel')}</legend>
            {(['this', 'following'] as const).map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="scope"
                  value={option}
                  checked={scope === option}
                  onChange={() => setScope(option)}
                  className="size-4 accent-primary"
                />
                {option === 'this' ? t('scopeThis') : t('scopeFollowing')}
              </label>
            ))}
          </fieldset>
        ) : null}
        <div role="status" className="text-sm">
          {countLine}
        </div>
        {preview && !preview.started ? (
          <div className="grid gap-1.5">
            <label htmlFor="cancel-class-message" className="text-sm font-medium">
              {t('messageLabel')}
            </label>
            <Textarea
              id="cancel-class-message"
              name="message"
              rows={3}
              maxLength={MESSAGE_LIMIT}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              aria-describedby="cancel-class-message-hint"
            />
            <p id="cancel-class-message-hint" className="text-[13px] text-muted-foreground">
              {t('messageHint')}
            </p>
          </div>
        ) : null}
        {problem ? <ErrorLine>{problem}</ErrorLine> : null}
        <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0 pt-2">
          <Button type="button" variant="outline" onClick={close}>
            {t('back')}
          </Button>
          <Button type="submit" variant="destructive" disabled={pending || !preview}>
            {t('submit')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
