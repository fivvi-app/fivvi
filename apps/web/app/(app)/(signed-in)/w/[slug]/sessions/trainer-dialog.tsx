'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import { pickContentLanguage, type TrainerWordForms } from '@fivvi/i18n';
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
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { type DoubleBooking, DoubleBookingDialog } from './double-booking';
import type { Session } from './sessions-client';
import {
  assignTrainer,
  loadTrainerCandidates,
  type TrainerCandidates,
} from './trainer-assignment-client';
import { assignKind } from './trainer-dialog-model';
import { type TrainerChoice, TrainerForm, type TrainerFormClient } from './trainer-form';
import { useSessionFormat } from './use-session-format';

/** What the dialog tells its owner once the trainer is assigned: the done text and the session as it is now. */
export interface TrainerAssigned {
  message: string;
  session: Session;
}

type Loaded =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; candidates: TrainerCandidates };

type Failure =
  | { kind: 'changed'; by: string | null }
  | { kind: 'cancelled' }
  | { kind: 'noPermission' }
  | { kind: 'notSaved' };

/**
 * CO-02 *Trainer toewijzen* / *Trainer vervangen* of a class date and *Trainer wijzigen* of a
 * private session (F023, the Owner only): the title and the line "{klas} · {datum}, {begin}–{eind}"
 * or "{klant} · Privésessie", then the form (`TrainerForm`) with what the candidates route answers.
 * *Toewijzen* sends the choice with the version the person saw. When the new trainer already has
 * something then, the API warns (409 `trainer_conflict`) and PS-07 asks; *Toch opslaan* sends the
 * same choice with `allowConflicts`. When someone else changed the session first (409), the dialog
 * says who and shows the session as it is now; the person decides again. A 403 means the person may
 * not assign any more (AC12). `initialTrainerId` has a trainer chosen from the start (the calendar's
 * drag to a trainer's column).
 */
export function TrainerDialog({
  workspaceId,
  slug,
  session,
  client,
  trainerWord,
  workspaceName,
  teamMemberId,
  initialTrainerId,
  onClose,
  onAssigned,
}: {
  workspaceId: string;
  slug: string;
  session: Session;
  /** The one client of a private session. */
  client?: TrainerFormClient;
  trainerWord: TrainerWordForms;
  workspaceName: string;
  /** The signed-in person's own team-member ID: PS-07 says "Je hebt dan al iets" when they pick themself. */
  teamMemberId: string;
  initialTrainerId?: string;
  onClose: () => void;
  onAssigned: (assigned: TrainerAssigned) => void;
}) {
  const t = useTranslations('sessions.trainerDialog');
  const locale = useLocale();
  // The session as the person saw it; a 409 replaces it with the session as it is now.
  const [current, setCurrent] = useState(session);
  const when = useSessionFormat(current.timeZone);
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [reload, setReload] = useState(0);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  // PS-07: what the chosen trainer already has then, and the choice *Toch opslaan* sends again.
  const [doubleBooking, setDoubleBooking] = useState<DoubleBooking | null>(null);
  const choice = useRef<TrainerChoice | null>(null);
  const [chosenId, setChosenId] = useState(initialTrainerId);
  // `reload` asks for the candidates again; the effect reads it only to run again.
  const sessionId = current.id;
  useEffect(() => {
    let active = reload >= 0;
    setLoaded({ state: 'loading' });
    void loadTrainerCandidates(workspaceId, sessionId).then((result) => {
      if (!active) return;
      if (result.ok) return setLoaded({ state: 'ready', candidates: result.candidates });
      if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
      setLoaded({ state: 'failed' });
    });
    return () => {
      active = false;
    };
  }, [workspaceId, sessionId, reload]);

  // What the session is offered now: a 409 can show it with a trainer already (no longer offered one).
  const kind = assignKind(current);
  const className = current.groupClass
    ? pickContentLanguage(locale, current.groupClass.nameNl, current.groupClass.nameEn)
    : '';
  const name = (id: string) =>
    loaded.state === 'ready'
      ? (loaded.candidates.trainers.find((candidate) => candidate.id === id)?.name ?? '')
      : '';

  async function save(picked: TrainerChoice, allowConflicts: boolean) {
    choice.current = picked;
    setChosenId(picked.trainerId);
    setPending(true);
    setFailure(null);
    const result = await assignTrainer(workspaceId, current.id, {
      trainerId: picked.trainerId,
      ...(picked.scope ? { scope: picked.scope } : {}),
      version: current.version,
      notifyClients: picked.notifyClients,
      ...(allowConflicts ? { allowConflicts } : {}),
    });
    if (result.ok) {
      const trainer = name(picked.trainerId);
      return onAssigned({
        session: result.session,
        message:
          current.type === 'private'
            ? t('donePrivate', { ...trainerWord, trainer })
            : t('doneClass', { trainer, class: className, date: when.day(current.startsAt) }),
      });
    }
    setPending(false);
    setDoubleBooking(null);
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    if (result.reason === 'trainerConflict') {
      return setDoubleBooking({
        conflicts: result.conflicts,
        trainerName: picked.trainerId === teamMemberId ? null : name(picked.trainerId),
      });
    }
    if (result.reason === 'conflict') {
      // The reloaded values: the dialog shows the session as it is now, and the next save uses its version.
      setCurrent(result.session);
      if (result.code === 'session_cancelled') return setFailure({ kind: 'cancelled' });
      setReload((count) => count + 1);
      return setFailure({ kind: 'changed', by: result.changedBy ?? null });
    }
    setFailure({ kind: result.reason === 'forbidden' ? 'noPermission' : 'notSaved' });
  }

  const message =
    failure?.kind === 'changed'
      ? failure.by
        ? t('errors.changedBy', { name: failure.by })
        : t('errors.changedByUnknown')
      : failure?.kind === 'cancelled'
        ? t('errors.cancelled')
        : failure?.kind === 'noPermission'
          ? t('errors.noPermission')
          : failure?.kind === 'notSaved'
            ? t('errors.notSaved')
            : null;

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent
        aria-describedby="trainer-dialog-description"
        className="gap-0 rounded-[14px] p-5.5 sm:max-w-md"
      >
        <div className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="text-lg leading-snug font-semibold">
              {kind === 'substitute'
                ? t('titleSubstitute', { ...trainerWord })
                : kind === 'change'
                  ? t('titleChange', { ...trainerWord })
                  : t('titleAssign', { ...trainerWord })}
            </DialogTitle>
            <DialogDescription id="trainer-dialog-description">
              {current.type === 'private'
                ? t('subtitlePrivate', { client: client?.name ?? '' })
                : t('subtitleClass', {
                    class: className,
                    date: when.day(current.startsAt),
                    start: when.time(current.startsAt),
                    end: when.time(current.endsAt),
                  })}
            </DialogDescription>
          </DialogHeader>
          {kind === null ? (
            <>
              {message ? <ErrorLine>{message}</ErrorLine> : null}
              <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0 pt-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  {t('cancel')}
                </Button>
              </DialogFooter>
            </>
          ) : loaded.state === 'ready' ? (
            <TrainerForm
              // The form starts again on the session as it is now (its version, its trainer).
              key={`${current.version}-${reload}`}
              session={current}
              kind={kind}
              candidates={loaded.candidates}
              {...(client ? { client } : {})}
              trainerWord={trainerWord}
              workspaceName={workspaceName}
              slug={slug}
              {...(chosenId ? { initialTrainerId: chosenId } : {})}
              {...(choice.current?.scope ? { initialScope: choice.current.scope } : {})}
              message={message}
              pending={pending}
              onSubmit={(picked) => void save(picked, false)}
              onCancel={onClose}
            />
          ) : loaded.state === 'failed' ? (
            <ErrorLine>{t('errors.loadFailed')}</ErrorLine>
          ) : null}
        </div>
        <DoubleBookingDialog
          doubleBooking={doubleBooking}
          timeZone={current.timeZone}
          pending={pending}
          onBack={() => setDoubleBooking(null)}
          onSaveAnyway={() => choice.current && void save(choice.current, true)}
        />
      </DialogContent>
    </Dialog>
  );
}
