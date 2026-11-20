'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import { GROUP_CLASS_LIMITS as LIMITS } from '@fivvi/domain/group-class-limits';
import { pickContentLanguage, type TrainerWordForms } from '@fivvi/i18n';
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
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { type DoubleBooking, DoubleBookingDialog } from '../sessions/double-booking';
import { previewTimes } from '../sessions/session-time';
import { useSessionFormat } from '../sessions/use-session-format';
import {
  type DateErrorKey,
  type GroupClass,
  loadScheduleContext,
  type ScheduleContext,
  type Session,
  type StartErrorKey,
  scheduleClassDate,
} from './classes-client';
import { FormSection } from './form-section';

type Loaded =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; context: ScheduleContext };

/**
 * The dialog of *Op een datum plannen* (F021 AC3, AC5), from a class's page or from **+ Nieuw** →
 * *Groepsles*. With a `classId` the class is fixed; without one the dialog asks for the class first
 * and offers *Nieuwe les* (`newClass`). *De les* holds the class, the trainer and the capacity,
 * prefilled from the class and changeable for this date; *Wanneer* holds the date and the start,
 * with *Eindigt om …* from the class's duration. The location is the workspace's. `scheduled` runs
 * with the date the API stored.
 */
export function ScheduleDialogContent({
  workspaceId,
  classId,
  trainerWord,
  newClass,
  scheduled,
}: {
  workspaceId: string;
  classId?: string;
  trainerWord: TrainerWordForms;
  /** Closes this dialog and opens the form for a new class; absent where the class is fixed. */
  newClass?: () => void;
  scheduled: (session: Session) => void;
}) {
  const t = useTranslations('classes.schedule');
  const e = useTranslations('classes.schedule.errors');
  const names = useTranslations('classes');
  const locale = useLocale();
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [chosen, setChosen] = useState(classId ?? '');
  const [localDate, setLocalDate] = useState('');
  const [localStart, setLocalStart] = useState('');
  const [trainerId, setTrainerId] = useState('');
  const [capacity, setCapacity] = useState('');
  const [required, setRequired] = useState<{ classId?: boolean; date?: boolean; start?: boolean }>(
    {},
  );
  const [apiErrors, setApiErrors] = useState<{
    date?: DateErrorKey;
    start?: StartErrorKey;
    capacity?: true;
  }>({});
  const [formError, setFormError] = useState<'noPermission' | 'notSaved' | null>(null);
  const [pending, setPending] = useState(false);
  // PS-07: the sessions the trainer already has then; *Terug* closes it and keeps the form.
  const [doubleBooking, setDoubleBooking] = useState<DoubleBooking | null>(null);
  const timeZone = loaded.status === 'ready' ? loaded.context.timeZone : 'Europe/Amsterdam';
  const { localDate: writtenDate } = useSessionFormat(timeZone);

  /** Takes the class's trainer and capacity into the form. */
  function prefill(groupClass: GroupClass | undefined) {
    setTrainerId(groupClass?.defaultTrainer?.id ?? '');
    setCapacity(groupClass ? String(groupClass.capacity) : '');
  }

  useEffect(() => {
    let current = true;
    void loadScheduleContext(workspaceId).then((result) => {
      if (!current) return;
      if (!result.ok) {
        if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
        return setLoaded({ status: 'failed' });
      }
      setLoaded({ status: 'ready', context: result.context });
      const fixed = result.context.classes.find(({ id }) => id === classId);
      setTrainerId(fixed?.defaultTrainer?.id ?? '');
      setCapacity(fixed ? String(fixed.capacity) : '');
    });
    return () => {
      current = false;
    };
  }, [workspaceId, classId]);

  const groupClass =
    loaded.status === 'ready' ? loaded.context.classes.find(({ id }) => id === chosen) : undefined;
  const nameOf = (candidate: GroupClass) =>
    pickContentLanguage(locale, candidate.nameNl, candidate.nameEn);
  const preview = groupClass
    ? previewTimes({
        localDate,
        localStart,
        durationMinutes: groupClass.durationMinutes,
        timeZone,
        now: new Date(),
      })
    : ({ status: 'incomplete' } as const);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loaded.status !== 'ready') return;
    const missing = {
      classId: groupClass === undefined,
      date: localDate === '',
      start: localDate !== '' && localStart === '',
    };
    setRequired(missing);
    setApiErrors({});
    setFormError(null);
    if (!groupClass || missing.date || missing.start || preview.status !== 'placed') return;
    await save(groupClass, loaded.context, false);
  }

  /** Puts the class on the date; `allowConflicts` is *Toch opslaan* of PS-07: the same request again. */
  async function save(planned: GroupClass, context: ScheduleContext, allowConflicts: boolean) {
    setPending(true);
    const result = await scheduleClassDate(workspaceId, planned.id, {
      localDate,
      localStart,
      trainerId,
      capacity,
      ...(allowConflicts ? { allowConflicts } : {}),
    });
    if (result.ok) return scheduled(result.session);
    setPending(false);
    setDoubleBooking(null);
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    if (result.reason === 'trainerConflict') {
      return setDoubleBooking({
        conflicts: result.conflicts,
        trainerName: context.trainers.find(({ id }) => id === trainerId)?.name ?? null,
      });
    }
    if (result.reason === 'fields') {
      return setApiErrors({
        ...(result.date ? { date: result.date } : {}),
        ...(result.start ? { start: result.start } : {}),
        ...(result.capacity ? { capacity: true as const } : {}),
      });
    }
    setFormError(result.reason === 'forbidden' ? 'noPermission' : 'notSaved');
  }

  const skipped = preview.status === 'does-not-exist' || apiErrors.start === 'timeDoesNotExist';
  const dateError = apiErrors.date
    ? e(apiErrors.date)
    : required.date
      ? e('dateRequired')
      : undefined;
  const startError = skipped
    ? e('timeDoesNotExist', { date: writtenDate(localDate) })
    : apiErrors.start
      ? e(apiErrors.start)
      : required.start
        ? e('startRequired')
        : undefined;

  return (
    <DialogContent
      aria-describedby="schedule-class-description"
      className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_1fr_auto] gap-0 overflow-hidden rounded-[14px] p-0 sm:max-w-md"
    >
      <form noValidate onSubmit={submit} className="contents">
        <DialogHeader className="px-5.5 pt-5.5 pb-4">
          <DialogTitle className="text-lg leading-snug font-semibold">{t('title')}</DialogTitle>
          <DialogDescription id="schedule-class-description">{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="grid content-start gap-4 overflow-y-auto px-5.5 pb-4">
          {loaded.status === 'loading' ? null : loaded.status === 'failed' ? (
            <ErrorLine>{t('loadFailed')}</ErrorLine>
          ) : (
            <>
              <FormSection title={t('classSection')} first>
                {classId ? (
                  <p className="text-sm font-semibold">{groupClass ? nameOf(groupClass) : ''}</p>
                ) : (
                  <div className="grid gap-1.5">
                    <Label
                      htmlFor="schedule-class"
                      className={required.classId ? 'text-status-danger-fg' : undefined}
                    >
                      {t('classLabel')}
                    </Label>
                    <div className="flex items-center gap-2">
                      <NativeSelect
                        id="schedule-class"
                        name="classId"
                        value={chosen}
                        className="min-w-0 flex-1"
                        aria-invalid={required.classId ? true : undefined}
                        onChange={(event) => {
                          setChosen(event.target.value);
                          setRequired((was) => ({ ...was, classId: false }));
                          prefill(
                            loaded.context.classes.find(({ id }) => id === event.target.value),
                          );
                        }}
                      >
                        <NativeSelectOption value="">{t('classChoose')}</NativeSelectOption>
                        {loaded.context.classes.map((candidate) => (
                          <NativeSelectOption key={candidate.id} value={candidate.id}>
                            {nameOf(candidate)}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      {newClass ? (
                        <Button type="button" variant="outline" onClick={newClass}>
                          {names('new')}
                        </Button>
                      ) : null}
                    </div>
                    {loaded.context.classes.length === 0 ? (
                      <p className="text-[13px] text-muted-foreground">{t('classNone')}</p>
                    ) : null}
                    {required.classId ? <ErrorLine>{e('classRequired')}</ErrorLine> : null}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="schedule-trainer">
                      {t('trainerLabel', { ...trainerWord })}
                    </Label>
                    <NativeSelect
                      id="schedule-trainer"
                      name="trainerId"
                      value={trainerId}
                      className="w-full"
                      onChange={(event) => setTrainerId(event.target.value)}
                    >
                      <NativeSelectOption value="">
                        {names('trainerNeeded', { ...trainerWord })}
                      </NativeSelectOption>
                      {loaded.context.trainers.map((trainer) => (
                        <NativeSelectOption key={trainer.id} value={trainer.id}>
                          {trainer.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                  <Field
                    id="schedule-capacity"
                    name="capacity"
                    type="number"
                    inputMode="numeric"
                    label={t('capacityLabel')}
                    value={capacity}
                    onChange={(event) => {
                      setCapacity(event.target.value);
                      setApiErrors((was) => ({ ...was, capacity: undefined }));
                    }}
                    error={
                      apiErrors.capacity
                        ? e('capacityInvalid', {
                            min: LIMITS.capacity.min,
                            max: LIMITS.capacity.max,
                          })
                        : undefined
                    }
                  />
                </div>
                <p className="text-sm">{t('location', { name: loaded.context.locationName })}</p>
              </FormSection>
              <FormSection title={t('whenSection')}>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    id="schedule-date"
                    name="localDate"
                    type="date"
                    label={t('dateLabel')}
                    value={localDate}
                    onChange={(event) => {
                      setLocalDate(event.target.value);
                      setRequired((was) => ({ ...was, date: false }));
                      setApiErrors({});
                    }}
                    error={dateError}
                  />
                  <Field
                    id="schedule-start"
                    name="localStart"
                    type="time"
                    label={t('startLabel')}
                    value={localStart}
                    onChange={(event) => {
                      setLocalStart(event.target.value);
                      setRequired((was) => ({ ...was, start: false }));
                      setApiErrors({});
                    }}
                    error={startError}
                  />
                </div>
                <div className="text-[13px] text-muted-foreground" aria-live="polite">
                  {preview.status === 'placed' ? (
                    <p>
                      {preview.endsNextDay
                        ? t('endsAtNextDay', { time: preview.endTime })
                        : t('endsAt', { time: preview.endTime })}
                    </p>
                  ) : null}
                </div>
              </FormSection>
            </>
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
      <DoubleBookingDialog
        doubleBooking={doubleBooking}
        timeZone={timeZone}
        pending={pending}
        onBack={() => setDoubleBooking(null)}
        onSaveAnyway={() => {
          if (groupClass && loaded.status === 'ready') void save(groupClass, loaded.context, true);
        }}
      />
    </DialogContent>
  );
}
