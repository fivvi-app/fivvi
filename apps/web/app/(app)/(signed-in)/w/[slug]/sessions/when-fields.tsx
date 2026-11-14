'use client';

import { NativeSelect, NativeSelectOption } from '@fivvi/ui/components/native-select';
import { Field } from '@fivvi/ui/kit/field';
import { useTranslations } from 'next-intl';
import { DURATION_CHIPS, DURATIONS, type SessionTimePreview } from './session-time';
import type { DateErrorKey, StartErrorKey } from './sessions-client';
import { useSessionFormat } from './use-session-format';

/** What the person types about when: a date and a start in the workspace's time zone, and a length. */
export interface WhenValue {
  localDate: string;
  localStart: string;
  durationMinutes: number;
}

/**
 * The *when* of PS-01 and PS-05 (flow 04): *Datum*, *Begin*, *Duur* (the chips 45 · 60 · 90 and the
 * list of every other length), the end time under them, and the notes about the start: refused
 * because the clocks skip it, repeated because they go back, or in the past. The `preview` is
 * computed by the form (`previewTimes`) because the form needs the same facts to decide on the
 * save; `errors` are the API's refusals of the last save. The texts are in `sessions.form`.
 */
export function WhenFields({
  idPrefix,
  dateLabel,
  value,
  onChange,
  preview,
  errors,
  timeZone,
  showNotes = true,
}: {
  idPrefix: string;
  /** *Datum* for a new session, *Nieuwe datum* when moving one. */
  dateLabel: string;
  value: WhenValue;
  onChange: (value: WhenValue) => void;
  preview: SessionTimePreview;
  errors: { date?: DateErrorKey; start?: StartErrorKey; required?: 'date' | 'start' };
  timeZone: string;
  /** Whether the repeated-hour and past notes show (they are the form's, once it has a start). */
  showNotes?: boolean;
}) {
  const t = useTranslations('sessions.form');
  const e = useTranslations('sessions.form.errors');
  const notes = useTranslations('sessions.form.notes');
  const { localDate } = useSessionFormat(timeZone);
  // The refusal for a skipped start is the same whether the preview or the API found it.
  const skipped = preview.status === 'does-not-exist' || errors.start === 'timeDoesNotExist';
  const dateError = errors.date
    ? e(errors.date)
    : errors.required === 'date'
      ? e('dateRequired')
      : undefined;
  const startError = skipped
    ? e('timeDoesNotExist', { date: localDate(value.localDate) })
    : errors.start
      ? e(errors.start)
      : errors.required === 'start'
        ? e('startRequired')
        : undefined;
  const durationName = `${idPrefix}-duration`;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field
          id={`${idPrefix}-date`}
          name="localDate"
          type="date"
          label={dateLabel}
          value={value.localDate}
          onChange={(event) => onChange({ ...value, localDate: event.target.value })}
          error={dateError}
        />
        <Field
          id={`${idPrefix}-start`}
          name="localStart"
          type="time"
          label={t('startLabel')}
          value={value.localStart}
          onChange={(event) => onChange({ ...value, localStart: event.target.value })}
          error={startError}
        />
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm leading-none font-medium">{t('durationLabel')}</legend>
        <div className="flex flex-wrap items-center gap-2">
          {DURATION_CHIPS.map((minutes) => (
            <label key={minutes} className="cursor-pointer">
              <input
                type="radio"
                name={durationName}
                className="peer sr-only"
                checked={value.durationMinutes === minutes}
                onChange={() => onChange({ ...value, durationMinutes: minutes })}
              />
              <span className="inline-flex h-8 items-center rounded-full border border-input px-3 text-sm peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50">
                {t('durationMinutes', { minutes })}
              </span>
            </label>
          ))}
          <NativeSelect
            aria-label={t('durationOther')}
            name="durationMinutes"
            value={value.durationMinutes}
            onChange={(event) =>
              onChange({ ...value, durationMinutes: Number(event.target.value) })
            }
          >
            {(DURATIONS.includes(value.durationMinutes)
              ? DURATIONS
              : [...DURATIONS, value.durationMinutes].sort((a, b) => a - b)
            ).map((minutes) => (
              <NativeSelectOption key={minutes} value={minutes}>
                {t('durationMinutes', { minutes })}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </fieldset>
      <div className="grid gap-1.5 text-[13px]" aria-live="polite">
        {preview.status === 'placed' ? (
          <>
            <p className="text-muted-foreground">
              {preview.endsNextDay
                ? t('endsAtNextDay', { time: preview.endTime })
                : t('endsAt', { time: preview.endTime })}
            </p>
            {showNotes && preview.repeatedStart ? (
              <p>
                {notes('repeatedTime', {
                  date: localDate(value.localDate),
                  time: value.localStart,
                })}
              </p>
            ) : null}
            {showNotes && preview.past ? <p className="font-semibold">{notes('past')}</p> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
