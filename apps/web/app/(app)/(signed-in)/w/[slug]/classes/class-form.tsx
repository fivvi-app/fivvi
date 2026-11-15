'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import { GROUP_CLASS_LIMITS as LIMITS } from '@fivvi/domain/group-class-limits';
import type { TrainerWordForms } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@fivvi/ui/components/dialog';
import { Label } from '@fivvi/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@fivvi/ui/components/native-select';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { Field } from '@fivvi/ui/kit/field';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import {
  type ClassField,
  type ClassFieldError,
  type ClassInput,
  createClass,
  type GroupClass,
  loadScheduleContext,
  type Trainer,
} from './classes-client';
import { FormSection, TextAreaField } from './form-section';

/** The first duration a new class starts with; the Owner changes it. */
const FIRST_DURATION = '60';

const START: ClassInput = {
  nameNl: '',
  nameEn: '',
  descriptionNl: '',
  descriptionEn: '',
  trainerId: '',
  capacity: '',
  durationMinutes: FIRST_DURATION,
};

/**
 * The fields of the class form (TW-03), in titled sections with a line between them
 * (`DECISIONS.md` §6): *Naam en omschrijving* (the name and the description in Dutch and in
 * English, one per line, each label naming its language) and *De les* (the usual trainer or
 * *Trainer nodig*, the capacity and the duration). Each refused field has its message under it.
 */
export function ClassFormSections({
  idPrefix,
  value,
  onChange,
  errors,
  trainers,
  trainerWord,
}: {
  idPrefix: string;
  value: ClassInput;
  onChange: (value: ClassInput) => void;
  errors: Partial<Record<ClassField, ClassFieldError>>;
  trainers: readonly Trainer[];
  trainerWord: TrainerWordForms;
}) {
  const t = useTranslations('classes.form');
  const e = useTranslations('classes.form.errors');
  const classes = useTranslations('classes');
  const set = (patch: Partial<ClassInput>) => onChange({ ...value, ...patch });
  const message = (key: ClassFieldError | undefined) => {
    if (!key) return undefined;
    switch (key) {
      case 'nameTooLong':
        return e(key, { max: LIMITS.nameMaxLength });
      case 'descriptionTooLong':
        return e(key, { max: LIMITS.descriptionMaxLength });
      case 'capacityInvalid':
        return e(key, { min: LIMITS.capacity.min, max: LIMITS.capacity.max });
      case 'durationInvalid':
        return e(key, {
          min: LIMITS.duration.min,
          max: LIMITS.duration.max,
          step: LIMITS.duration.step,
        });
      default:
        return e(key);
    }
  };

  return (
    <div className="grid gap-4">
      <FormSection title={t('nameSection')} first>
        <Field
          id={`${idPrefix}-name-nl`}
          name="nameNl"
          label={t('nameNlLabel')}
          value={value.nameNl}
          autoComplete="off"
          onChange={(event) => set({ nameNl: event.target.value })}
          error={message(errors.nameNl)}
        />
        <Field
          id={`${idPrefix}-name-en`}
          name="nameEn"
          label={t('nameEnLabel')}
          value={value.nameEn}
          autoComplete="off"
          onChange={(event) => set({ nameEn: event.target.value })}
          error={message(errors.nameEn)}
        />
        <TextAreaField
          id={`${idPrefix}-description-nl`}
          name="descriptionNl"
          label={t('descriptionNlLabel')}
          value={value.descriptionNl}
          onChange={(descriptionNl) => set({ descriptionNl })}
          error={message(errors.descriptionNl)}
        />
        <TextAreaField
          id={`${idPrefix}-description-en`}
          name="descriptionEn"
          label={t('descriptionEnLabel')}
          value={value.descriptionEn}
          onChange={(descriptionEn) => set({ descriptionEn })}
          error={message(errors.descriptionEn)}
        />
      </FormSection>
      <FormSection title={t('classSection')}>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-trainer`}>{t('trainerLabel', { ...trainerWord })}</Label>
          <NativeSelect
            id={`${idPrefix}-trainer`}
            name="trainerId"
            value={value.trainerId}
            className="w-full"
            onChange={(event) => set({ trainerId: event.target.value })}
          >
            <NativeSelectOption value="">
              {classes('trainerNeeded', { ...trainerWord })}
            </NativeSelectOption>
            {trainers.map((trainer) => (
              <NativeSelectOption key={trainer.id} value={trainer.id}>
                {trainer.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            id={`${idPrefix}-capacity`}
            name="capacity"
            type="number"
            inputMode="numeric"
            label={t('capacityLabel')}
            value={value.capacity}
            onChange={(event) => set({ capacity: event.target.value })}
            error={message(errors.capacity)}
          />
          <Field
            id={`${idPrefix}-duration`}
            name="durationMinutes"
            type="number"
            inputMode="numeric"
            step={LIMITS.duration.step}
            label={t('durationLabel')}
            value={value.durationMinutes}
            onChange={(event) => set({ durationMinutes: event.target.value })}
            error={message(errors.durationMinutes)}
          />
        </div>
      </FormSection>
    </div>
  );
}

type Loaded =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; trainers: Trainer[] };

/**
 * The dialog of *Nieuwe les* (TW-03, F021 AC1, AC2): the form of `ClassFormSections` with
 * *Opslaan* and *Annuleren*. A refused or failed save keeps what was typed. `saved` runs with the
 * class the API stored.
 */
export function NewClassDialogContent({
  workspaceId,
  trainerWord,
  saved,
}: {
  workspaceId: string;
  trainerWord: TrainerWordForms;
  saved: (groupClass: GroupClass) => void;
}) {
  const t = useTranslations('classes.form');
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [value, setValue] = useState<ClassInput>(START);
  const [errors, setErrors] = useState<Partial<Record<ClassField, ClassFieldError>>>({});
  const [formError, setFormError] = useState<'noPermission' | 'notSaved' | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let current = true;
    void loadScheduleContext(workspaceId).then((result) => {
      if (!current) return;
      if (!result.ok) {
        if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
        return setLoaded({ status: 'failed' });
      }
      setLoaded({ status: 'ready', trainers: result.context.trainers });
    });
    return () => {
      current = false;
    };
  }, [workspaceId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setPending(true);
    const result = await createClass(workspaceId, value);
    if (result.ok) return saved(result.groupClass);
    setPending(false);
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    if (result.reason === 'fields') return setErrors(result.errors);
    setFormError(result.reason === 'forbidden' ? 'noPermission' : 'notSaved');
  }

  return (
    <DialogContent
      aria-describedby="new-class-description"
      className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_1fr_auto] gap-0 overflow-hidden rounded-[14px] p-0 sm:max-w-lg"
    >
      <form noValidate onSubmit={submit} className="contents">
        <DialogHeader className="px-5.5 pt-5.5 pb-4">
          <DialogTitle className="text-lg leading-snug font-semibold">{t('title')}</DialogTitle>
          <DialogDescription id="new-class-description">{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="grid content-start gap-4 overflow-y-auto px-5.5 pb-4">
          {loaded.status === 'loading' ? null : loaded.status === 'failed' ? (
            <ErrorLine>{t('loadFailed')}</ErrorLine>
          ) : (
            <ClassFormSections
              idPrefix="new-class"
              value={value}
              onChange={setValue}
              errors={errors}
              trainers={loaded.trainers}
              trainerWord={trainerWord}
            />
          )}
          {formError ? <ErrorLine>{t(`errors.${formError}`)}</ErrorLine> : null}
        </div>
        <DialogFooter className="mx-0 mb-0 rounded-none">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t('cancel')}
            </Button>
          </DialogClose>
          <Button type="submit" disabled={loaded.status !== 'ready' || pending}>
            {t('save')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
