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
import { type FormEvent, useState } from 'react';
import { previewTimes, wallClockOf } from './session-time';
import {
  type DateErrorKey,
  reschedulePrivateSession,
  type Session,
  type StartErrorKey,
} from './sessions-client';
import { useSessionFormat } from './use-session-format';
import { WhenFields, type WhenValue } from './when-fields';

/** The client of the session, as far as moving it needs: the name, and the language of the email. */
export interface MovedClient {
  name: string;
  emailLocale: Locale | null;
}

/**
 * PS-05 *Sessie verplaatsen* (F020): the button *Verplaatsen* of the session page and the dialog it
 * opens. The dialog shows where the session is now, asks for the new date, start and length, and
 * offers to email the client (EM-04, on for a session still to come). Its main button says what
 * will happen. The location stays. When someone else changed the session first (409, AC8) the form
 * says who and shows the session as it is now; the person decides again. After a move the page
 * reloads and says where the session went.
 */
export function RescheduleSession({
  workspaceId,
  session,
  client,
  defaultLocale,
}: {
  workspaceId: string;
  session: Session;
  client: MovedClient;
  /** The workspace's default language for emails. */
  defaultLocale: Locale;
}) {
  const t = useTranslations('sessions.page');
  const { day, time } = useSessionFormat(session.timeZone);
  const [open, setOpen] = useState(false);
  const [moved, setMoved] = useState<{ message: string; session: Session } | null>(null);
  // The page reloads after a move; until it has, the session the person moved is the newest one.
  const current = moved && moved.session.version > session.version ? moved.session : session;

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        {t('reschedule')}
      </Button>
      {moved ? (
        <p
          role="status"
          className="rounded-lg bg-status-success-bg px-3 py-2 text-sm font-semibold text-status-success-text"
        >
          {moved.message}
        </p>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <RescheduleForm
            workspaceId={workspaceId}
            session={current}
            client={client}
            defaultLocale={defaultLocale}
            close={() => setOpen(false)}
            moved={(result) => {
              setOpen(false);
              setMoved({
                message: t('moved', { date: day(result.startsAt), time: time(result.startsAt) }),
                session: result,
              });
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}

type Failure =
  | { kind: 'changed'; by: string | null }
  | { kind: 'cancelled' }
  | { kind: 'noPermission' }
  | { kind: 'notSaved' };

function RescheduleForm({
  workspaceId,
  session,
  client,
  defaultLocale,
  close,
  moved,
}: {
  workspaceId: string;
  session: Session;
  client: MovedClient;
  defaultLocale: Locale;
  close: () => void;
  moved: (session: Session) => void;
}) {
  const t = useTranslations('sessions.reschedule');
  const form = useTranslations('sessions.form');
  const router = useRouter();
  // The session as the person saw it; a 409 replaces it with the session as it is now.
  const [current, setCurrent] = useState(session);
  const { timeZone } = current;
  const { dayYear, time } = useSessionFormat(timeZone);
  const [when, setWhen] = useState<WhenValue>(() => wallClockOf(current, timeZone));
  const [notify, setNotify] = useState(() => new Date(current.startsAt) > new Date());
  const [required, setRequired] = useState<'date' | 'start' | undefined>();
  const [apiErrors, setApiErrors] = useState<{ date?: DateErrorKey; start?: StartErrorKey }>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);

  const preview = previewTimes({ ...when, timeZone, now: new Date() });
  const language =
    (client.emailLocale ?? defaultLocale) === 'en' ? form('languageEn') : form('languageNl');

  function change(next: WhenValue) {
    setWhen(next);
    setRequired(undefined);
    setApiErrors({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing = when.localDate === '' ? 'date' : when.localStart === '' ? 'start' : undefined;
    setRequired(missing);
    setFailure(null);
    setApiErrors({});
    if (missing || preview.status !== 'placed') return;
    setPending(true);
    const result = await reschedulePrivateSession(workspaceId, current.id, {
      ...when,
      notify,
      version: current.version,
    });
    if (result.ok) {
      router.refresh();
      return moved(result.session);
    }
    setPending(false);
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    if (result.reason === 'fields') return setApiErrors({ date: result.date, start: result.start });
    if (result.reason === 'conflict') {
      // The reloaded values: the form shows the session as it is now, and the next save uses its version.
      setCurrent(result.session);
      setWhen(wallClockOf(result.session, result.session.timeZone));
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
        ? t('cancelled')
        : failure?.kind === 'noPermission'
          ? t('noPermission')
          : failure?.kind === 'notSaved'
            ? form('errors.notSaved')
            : null;

  return (
    <DialogContent
      aria-describedby="reschedule-description"
      className="gap-0 rounded-[14px] p-5.5 sm:max-w-115"
    >
      <form noValidate onSubmit={submit} className="grid gap-4">
        <DialogHeader>
          <DialogTitle className="text-lg leading-snug font-semibold">{t('title')}</DialogTitle>
          <DialogDescription id="reschedule-description">
            {t('subtitle', { client: client.name })}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          {t('current', {
            date: dayYear(current.startsAt),
            start: time(current.startsAt),
            end: time(current.endsAt),
            location: current.location.name,
          })}
        </p>
        <WhenFields
          idPrefix="reschedule"
          dateLabel={t('dateLabel')}
          value={when}
          onChange={change}
          preview={preview}
          errors={{ ...apiErrors, required }}
          timeZone={timeZone}
        />
        <p className="text-sm">{t('locationUnchanged', { location: current.location.name })}</p>
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
            {t('notifyNote', { client: client.name, language })}
          </p>
        </div>
        {message ? <ErrorLine>{message}</ErrorLine> : null}
        <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0 pt-2">
          <Button type="button" variant="outline" onClick={close}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={pending}>
            {notify ? t('submitNotify') : t('submit')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
