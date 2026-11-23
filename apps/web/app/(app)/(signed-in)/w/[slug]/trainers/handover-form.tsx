'use client';

import type { TrainerWordForms } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import { DialogFooter } from '@fivvi/ui/components/dialog';
import { NativeSelect, NativeSelectOption } from '@fivvi/ui/components/native-select';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { canHandOver, handoverOf, NOBODY } from './handover-model';
import type { FutureSessions, Handover } from './remove-team-member-client';

/**
 * The body of the removal dialog when the person has sessions coming (TW-06, F023): what the next 2
 * weeks hold ("De komende 2 weken: 4 groepslessen en 3 privésessies."), where the private sessions
 * and the classes go (*Privésessies overdragen aan*, *Lessen overdragen aan*: a trainer of the
 * workspace or *Niemand*, which cancels the private sessions with the email and gives the classes
 * *Trainer nodig*), what happens after the next 2 weeks (*Trainer nodig*, never cancelled) and the
 * box *Klanten informeren per e-mail*. With no other trainer *Niemand* is the only choice, so the
 * person can still be removed. The API decides every rule; this words what it counted.
 */
export function HandoverForm({
  member,
  future,
  trainers,
  trainerWord,
  initialPrivateTo,
  initialClassesTo,
  message,
  pending,
  onSubmit,
  onCancel,
}: {
  member: { id: string; name: string };
  future: FutureSessions;
  /** The trainers of the workspace except the person who goes. */
  trainers: readonly { id: string; name: string }[];
  trainerWord: TrainerWordForms;
  initialPrivateTo?: string;
  initialClassesTo?: string;
  message: string | null;
  pending: boolean;
  onSubmit: (handover: Handover) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('team.handover');
  const form = useTranslations('sessions.form');
  const remove = useTranslations('team');
  const window = future.nextTwoWeeks;
  const later = future.later.privateSessions + future.later.classDates;
  // With a trainer to choose, nothing is chosen for the Owner (Niemand cancels sessions); with none, Niemand is the one choice.
  const start = trainers.length > 0 ? '' : NOBODY;
  const [privateTo, setPrivateTo] = useState(initialPrivateTo ?? start);
  const [classesTo, setClassesTo] = useState(initialClassesTo ?? start);
  const [notify, setNotify] = useState(true);
  const values = { privateTo, classesTo, notifyClients: notify };
  const hasWindow = window.privateSessions > 0 || window.classDates > 0;
  const anyNobody =
    (window.privateSessions > 0 && privateTo === NOBODY) ||
    (window.classDates > 0 && classesTo === NOBODY);

  const parts = [
    window.classDates > 0 ? t('classesCount', { count: window.classDates }) : undefined,
    window.privateSessions > 0 ? t('privateCount', { count: window.privateSessions }) : undefined,
  ].filter((part): part is string => part !== undefined);
  const [firstPart = '', secondPart] = parts;
  const counts = secondPart ? t('partsJoin', { first: firstPart, second: secondPart }) : firstPart;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const handover = handoverOf(values, window);
    if (handover && !pending) onSubmit(handover);
  }

  const select = (id: string, label: string, value: string, change: (value: string) => void) => (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <NativeSelect
        id={id}
        className="w-full"
        value={value}
        onChange={(event) => change(event.target.value)}
      >
        {trainers.length > 0 ? (
          <NativeSelectOption value="">
            {form('trainerChoose', { ...trainerWord })}
          </NativeSelectOption>
        ) : null}
        {trainers.map((trainer) => (
          <NativeSelectOption key={trainer.id} value={trainer.id}>
            {trainer.name}
          </NativeSelectOption>
        ))}
        <NativeSelectOption value={NOBODY}>{t('nobody')}</NativeSelectOption>
      </NativeSelect>
    </div>
  );

  return (
    <form noValidate onSubmit={submit} className="grid gap-4">
      {hasWindow ? (
        <p className="text-sm font-semibold">{t('nextTwoWeeks', { parts: counts })}</p>
      ) : null}
      {window.privateSessions > 0
        ? select('handover-private', t('privateLabel'), privateTo, setPrivateTo)
        : null}
      {window.classDates > 0
        ? select('handover-classes', t('classesLabel'), classesTo, setClassesTo)
        : null}
      {anyNobody ? (
        <p className="text-sm text-muted-foreground">{t('nobodyNote', { ...trainerWord })}</p>
      ) : null}
      {later > 0 ? <p className="text-sm">{t('later', { ...trainerWord, count: later })}</p> : null}
      {future.regularTrainerOfSeries ? (
        <p className="text-sm">{t('seriesNote', { ...trainerWord, name: member.name })}</p>
      ) : null}
      {hasWindow ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="notify"
            className="size-4 accent-primary"
            checked={notify}
            onChange={(event) => setNotify(event.target.checked)}
          />
          {t('notify')}
        </label>
      ) : null}
      {message ? <ErrorLine>{message}</ErrorLine> : null}
      <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {remove('removeDialog.cancel')}
        </Button>
        <Button
          type="submit"
          variant="destructive"
          disabled={pending || !canHandOver(values, window)}
        >
          {t('submit')}
        </Button>
      </DialogFooter>
    </form>
  );
}
