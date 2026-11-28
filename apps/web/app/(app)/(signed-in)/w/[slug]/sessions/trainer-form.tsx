'use client';

import { type Locale, pickContentLanguage, type TrainerWordForms } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import { DialogFooter } from '@fivvi/ui/components/dialog';
import { NativeSelect, NativeSelectOption } from '@fivvi/ui/components/native-select';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import type { Route } from 'next';
import Link from 'next/link';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import type { Session, TrainerConflictItem } from './sessions-client';
import type { TrainerCandidate, TrainerCandidates } from './trainer-assignment-client';
import {
  type AssignKind,
  type AssignScope,
  notifyCount,
  orderedCandidates,
  scopesOffered,
  startedBy,
  substitutionOf,
} from './trainer-dialog-model';
import { useSessionFormat } from './use-session-format';

/** What the person chose: who, for which dates, and whether to email the clients. */
export interface TrainerChoice {
  trainerId: string;
  /** For a class date; a private session has none. */
  scope?: AssignScope;
  /** The box that emails the clients (a substitution has its own two boxes instead). */
  notifyClients: boolean;
  /** A substitution (F024), *Alleen deze les* on a date that has a trainer: the box that emails the substitute (EM-10). */
  notifySubstitute?: boolean;
  /** A substitution (F024): the box that emails the participants, also when the substitution ends. */
  notifyParticipants?: boolean;
}

/** The client of a private session, as far as the email box needs: the name, the address and the language of the email. */
export interface TrainerFormClient {
  name: string;
  email: string;
  /** The client's own email language, else the workspace's default (ADR-017). */
  emailLocale: Locale;
}

/**
 * The body of CO-02 *Trainer toewijzen* / *Trainer vervangen* (class date) and of *Trainer wijzigen*
 * (private session), as the candidates route answers it (F023): a radio list of the other trainers
 * (a select for a private session), each with what they already have then in this workspace; for a
 * class date in a series *Voor* (*Alleen deze les* / *Deze en alle volgende lessen*) with the
 * regular-trainer line and the later dates that conflict; *De boekingen blijven gewoon staan.*; and
 * the box that emails the clients, with how many. *Alleen deze les* on a date that has a trainer is a
 * substitution (F024, the default): the substitute's own email box and the participants' box, the
 * regular trainer first as *(vaste trainer)*, and choosing them ends it. The API decides every rule;
 * this words what it answered. Without another trainer it says so and leads to *Trainers* (F011).
 */
export function TrainerForm({
  session,
  kind,
  candidates,
  client,
  trainerWord,
  workspaceName,
  slug,
  initialTrainerId = '',
  initialScope,
  now,
  message,
  pending,
  onSubmit,
  onCancel,
}: {
  session: Session;
  kind: AssignKind;
  candidates: TrainerCandidates;
  /** The one client of a private session. */
  client?: TrainerFormClient;
  trainerWord: TrainerWordForms;
  workspaceName: string;
  slug: string;
  /** The trainer chosen from the start (the calendar's drag to a trainer's column, or the last choice). */
  initialTrainerId?: string;
  initialScope?: AssignScope;
  /** The moment the dialog is drawn: a date that has started has no email box (F024). Defaults to the clock. */
  now?: Date;
  /** What went wrong with the last try, in words. */
  message: string | null;
  pending: boolean;
  onSubmit: (choice: TrainerChoice) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('sessions.trainerDialog');
  const form = useTranslations('sessions.form');
  const locale = useLocale();
  const format = useFormatter();
  const when = useSessionFormat(session.timeZone);
  const scopes = scopesOffered(session);
  const [trainerId, setTrainerId] = useState(initialTrainerId);
  const [scope, setScope] = useState<AssignScope | undefined>(initialScope ?? scopes[0]);
  const [notify, setNotify] = useState(true);
  const [notifySubstitute, setNotifySubstitute] = useState(true);
  const [notifyParticipants, setNotifyParticipants] = useState(true);

  const chosen = candidates.trainers.find(({ id }) => id === trainerId);
  const count = notifyCount(candidates, kind === 'change' ? undefined : scope);
  // F024: *Alleen deze les* on a date that has a trainer is a substitution; choosing the trainer it
  // replaces ends it. A date that has started is recorded all the same, and tells nobody.
  const substituting = kind === 'substitute' && substitutionOf(session, scope);
  const ending = substituting && chosen !== undefined && chosen.id === session.substituteFor?.id;
  const started = startedBy(session, now ?? new Date());
  const participants = substituting && !started ? count : 0;
  const emailsSubstitute = substituting && !ending && !started && chosen !== undefined;
  const className = session.groupClass
    ? pickContentLanguage(locale, session.groupClass.nameNl, session.groupClass.nameEn)
    : '';

  /** "geeft dan al Kracht (18:00)", "heeft dan al een privésessie (18:30)": one phrase per overlap. */
  function phrase(item: TrainerConflictItem) {
    const time = when.time(item.startsAt);
    if (item.type === 'private') return t('conflictPrivate', { time });
    if (item.type === 'open_gym') return t('conflictOpenGym', { time });
    return t('conflictClass', {
      name: pickContentLanguage(locale, item.displayName, item.displayNameEn),
      time,
    });
  }
  /** The row of a trainer: the name (*Sarah (vaste trainer)* for the one a substitute replaces), and when they already have something then, the hint. */
  const label = (candidate: TrainerCandidate) => {
    const name =
      candidate.id === session.substituteFor?.id
        ? t('regularTrainer', { ...trainerWord, name: candidate.name })
        : candidate.name;
    return candidate.conflicts.length > 0
      ? t('conflictHint', { trainer: name, hint: candidate.conflicts.map(phrase).join(', ') })
      : name;
  };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chosen || pending) return;
    onSubmit({
      trainerId: chosen.id,
      ...(scope ? { scope } : {}),
      // A substitution tells nobody through `notifyClients`: it has its two boxes.
      notifyClients: !substituting && notify && count > 0,
      ...(substituting
        ? {
            notifySubstitute: emailsSubstitute && notifySubstitute,
            notifyParticipants: participants > 0 && notifyParticipants,
          }
        : {}),
    });
  }

  if (candidates.trainers.length === 0) {
    return (
      <div className="grid gap-4">
        <p className="text-sm">{t('noOthers', { ...trainerWord, workspace: workspaceName })}</p>
        <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button asChild>
            <Link href={`/w/${slug}/trainers` as Route}>
              {t('inviteTrainer', { ...trainerWord })}
            </Link>
          </Button>
        </DialogFooter>
      </div>
    );
  }

  const language = client?.emailLocale === 'en' ? form('languageEn') : form('languageNl');
  const submitLabel =
    kind === 'assign'
      ? t('submitAssign')
      : kind === 'substitute'
        ? t('submitSubstitute')
        : t('submitChange');

  return (
    <form noValidate onSubmit={submit} className="grid gap-4">
      {kind !== 'assign' && session.trainer ? (
        <p className="text-sm">{t('currently', { name: session.trainer.name })}</p>
      ) : null}
      {kind === 'change' ? (
        <div className="grid gap-1.5">
          <label htmlFor="trainer-select" className="text-sm font-medium">
            {trainerWord.Word}
          </label>
          <NativeSelect
            id="trainer-select"
            name="trainer"
            className="w-full"
            value={trainerId}
            onChange={(event) => setTrainerId(event.target.value)}
          >
            <NativeSelectOption value="">
              {t('selectPlaceholder', { ...trainerWord })}
            </NativeSelectOption>
            {candidates.trainers.map((candidate) => (
              <NativeSelectOption key={candidate.id} value={candidate.id}>
                {label(candidate)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      ) : (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">
            {kind === 'assign' ? t('whoAssign') : t('whoSubstitute')}
          </legend>
          {orderedCandidates(candidates.trainers, session).map((candidate) => (
            <label key={candidate.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="trainer"
                value={candidate.id}
                checked={trainerId === candidate.id}
                onChange={() => setTrainerId(candidate.id)}
                className="size-4 accent-primary"
              />
              {label(candidate)}
            </label>
          ))}
        </fieldset>
      )}
      {kind !== 'change' && scopes.length > 1 ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{t('scopeLabel')}</legend>
          {scopes.map((option) => (
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
      {kind === 'substitute' && scopes.length === 1 ? (
        <p className="text-sm">
          <span className="font-medium">{t('scopeLabel')}:</span> {t('scopeThis')}
        </p>
      ) : null}
      {kind !== 'change' && scope === 'following' && chosen && session.series ? (
        <div className="grid gap-1 text-sm">
          <p>
            {t('followingLine', {
              ...trainerWord,
              trainer: chosen.name,
              date: format.dateTime(new Date(`${session.series.occurrenceDate}T12:00:00Z`), {
                timeZone: 'UTC',
                day: 'numeric',
                month: 'long',
              }),
              class: className,
            })}
          </p>
          {chosen.laterConflictingDates > 0 ? (
            <p>
              {t('laterConflicts', { trainer: chosen.name, count: chosen.laterConflictingDates })}
            </p>
          ) : null}
        </div>
      ) : null}
      {kind !== 'change' ? <p className="text-sm">{t('bookingsStay')}</p> : null}
      {emailsSubstitute && chosen ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="notifySubstitute"
            className="size-4 accent-primary"
            checked={notifySubstitute}
            onChange={(event) => setNotifySubstitute(event.target.checked)}
          />
          {t('notifySubstitute', { trainer: chosen.name })}
        </label>
      ) : null}
      {substituting && participants > 0 ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="notifyParticipants"
            className="size-4 accent-primary"
            checked={notifyParticipants}
            onChange={(event) => setNotifyParticipants(event.target.checked)}
          />
          {t('notifyClass', { count: participants })}
        </label>
      ) : null}
      {!substituting && count > 0 ? (
        <div className="grid gap-0.5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="notify"
              className="size-4 accent-primary"
              checked={notify}
              onChange={(event) => setNotify(event.target.checked)}
            />
            {kind === 'change' && client
              ? t('notifyClient', { client: client.name })
              : t('notifyClass', { count })}
          </label>
          {kind === 'change' && client ? (
            <p className="pl-6 text-[13px] text-muted-foreground">
              {t('notifyClientNote', { email: client.email, language })}
            </p>
          ) : null}
        </div>
      ) : null}
      {message ? <ErrorLine>{message}</ErrorLine> : null}
      <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={pending || !chosen}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
