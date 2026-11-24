'use client';

import { pickContentLanguage } from '@fivvi/i18n';
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
import { SuccessLine } from '@fivvi/ui/kit/success-line';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import type { GroupClass } from '../classes/classes-client';
import { useSessionFormat } from '../sessions/use-session-format';
import {
  type BookingLink,
  type ClassDate,
  type CreateBookingLink,
  createBookingLink,
  listClassDates,
} from './booking-links-client';

type What = CreateBookingLink['scope'];
type Language = CreateBookingLink['language'];

/** What the form can make: all, the group classes, one class, one class on a date. */
const WHAT = ['all', 'group', 'class', 'session'] as const satisfies readonly What[];
const LANGUAGES: readonly Language[] = ['visitor', 'nl', 'en'];

/**
 * The content of the **Nieuwe boekingslink** dialog (TW-07, F037, the Owner): *Wat* (*Alle
 * boekingen*, *Groepslessen*, *Eén les* or *Eén les op een datum*, with a picker of the classes in
 * the viewer's language and, for a date, a picker of that class's upcoming dates in the workspace's
 * time zone, read from the calendar) and *Taal van de pagina*, with the hint that the visitor can
 * always switch. **Link maken** gets
 * or makes the link (the API returns the active one of the same scope and language instead of a
 * second one); the dialog then says "Boekingslink gemaakt." and shows the link with **Link
 * kopiëren**. `created` runs with the link, so the page lists it.
 */
export function NewBookingLinkContent({
  workspaceId,
  timeZone,
  classes,
  created,
  forbidden,
  signedOut,
}: {
  workspaceId: string;
  /** The workspace's time zone: the class's dates are written in it. */
  timeZone: string;
  classes: readonly GroupClass[];
  created: (link: BookingLink) => void;
  /** The API refused: this person may not make links (any more). */
  forbidden: () => void;
  /** The API says nobody is signed in. */
  signedOut: () => void;
}) {
  const t = useTranslations('bookingLinks');
  const n = useTranslations('bookingLinks.new');
  const common = useTranslations('common');
  const locale = useLocale();
  const id = useId();
  const [what, setWhat] = useState<What>('all');
  const [classId, setClassId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [dates, setDates] = useState<
    { state: 'idle' } | { state: 'loading' } | { state: 'ready'; dates: ClassDate[] }
  >({ state: 'idle' });
  const [missingDate, setMissingDate] = useState(false);
  const { day, time } = useSessionFormat(timeZone);
  const [language, setLanguage] = useState<Language>('visitor');
  const [missingClass, setMissingClass] = useState(false);
  const [failure, setFailure] = useState<'noConnection' | 'generic' | null>(null);
  const [pending, setPending] = useState(false);
  const needsClass = what === 'class' || what === 'session';
  // The callbacks are new on every render of the page; the effect below must not run again for them.
  const refused = useRef({ forbidden, signedOut });
  refused.current = { forbidden, signedOut };

  // A date of a class is chosen from the class's upcoming dates, as the calendar holds them.
  useEffect(() => {
    setSessionId('');
    if (what !== 'session' || classId === '') return setDates({ state: 'idle' });
    let current = true;
    setDates({ state: 'loading' });
    void listClassDates(workspaceId, classId, timeZone).then((result) => {
      if (!current) return;
      if (result.ok) return setDates({ state: 'ready', dates: result.dates });
      setDates({ state: 'idle' });
      if (result.reason === 'home') return refused.current.signedOut();
      if (result.reason === 'forbidden') return refused.current.forbidden();
      setFailure(result.reason);
    });
    return () => {
      current = false;
    };
  }, [what, classId, workspaceId, timeZone]);

  // What the dialog says once the link exists: "Boekingslink gemaakt.", then "Link gekopieerd".
  const [done, setDone] = useState<{ url: string; message: string } | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    const missingWhichClass = needsClass && classId === '';
    const missingWhichDate = what === 'session' && classId !== '' && sessionId === '';
    setMissingClass(missingWhichClass);
    setMissingDate(missingWhichDate);
    if (missingWhichClass || missingWhichDate) return;
    setPending(true);
    const result = await createBookingLink(workspaceId, {
      scope: what,
      language,
      ...(what === 'class' ? { groupClassId: classId } : {}),
      ...(what === 'session' ? { sessionId } : {}),
    });
    setPending(false);
    if (result.ok) {
      setDone({ url: result.link.url, message: n('created') });
      return created(result.link);
    }
    if (result.reason === 'home') return signedOut();
    if (result.reason === 'forbidden') return forbidden();
    setFailure(result.reason);
  }

  async function copy(url: string) {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(url);
      setDone({ url, message: t('copied') });
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <DialogContent
      aria-describedby={`${id}-description`}
      className="rounded-[14px] p-0 sm:max-w-md"
    >
      <form noValidate onSubmit={submit} className="contents">
        <DialogHeader className="px-5.5 pt-5.5">
          <DialogTitle className="text-lg leading-snug font-semibold">{n('title')}</DialogTitle>
          <DialogDescription id={`${id}-description`}>{t('body')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 px-5.5 pb-1">
          {done ? (
            <div className="grid gap-3">
              <SuccessLine>{done.message}</SuccessLine>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2">
                <code data-testid="new-link-url" className="min-w-0 flex-1 break-all text-[13px]">
                  {done.url}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copy(done.url)}
                >
                  {t('copy')}
                </Button>
              </div>
              {copyFailed ? <ErrorLine>{t('errors.copy')}</ErrorLine> : null}
            </div>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-what`}>{n('whatLabel')}</Label>
                <NativeSelect
                  id={`${id}-what`}
                  name="scope"
                  value={what}
                  className="w-full"
                  onChange={(event) => {
                    setWhat(event.target.value as What);
                    setMissingClass(false);
                    setMissingDate(false);
                    setFailure(null);
                  }}
                >
                  {WHAT.map((option) => (
                    <NativeSelectOption key={option} value={option}>
                      {n(`what.${option}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              {needsClass ? (
                <div className="grid gap-1.5">
                  <Label
                    htmlFor={`${id}-class`}
                    className={missingClass ? 'text-status-danger-fg' : undefined}
                  >
                    {n('classLabel')}
                  </Label>
                  <NativeSelect
                    id={`${id}-class`}
                    name="groupClassId"
                    value={classId}
                    className="w-full"
                    aria-invalid={missingClass ? true : undefined}
                    aria-describedby={missingClass ? `${id}-class-error` : undefined}
                    onChange={(event) => {
                      setClassId(event.target.value);
                      setMissingClass(false);
                      setFailure(null);
                    }}
                  >
                    <NativeSelectOption value="">{n('classChoose')}</NativeSelectOption>
                    {classes.map((groupClass) => (
                      <NativeSelectOption key={groupClass.id} value={groupClass.id}>
                        {pickContentLanguage(locale, groupClass.nameNl, groupClass.nameEn)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  {classes.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">{n('classNone')}</p>
                  ) : null}
                  {missingClass ? (
                    <ErrorLine id={`${id}-class-error`}>{n('classRequired')}</ErrorLine>
                  ) : null}
                </div>
              ) : null}
              {what === 'session' && classId !== '' ? (
                <div className="grid gap-1.5">
                  <Label
                    htmlFor={`${id}-date`}
                    className={missingDate ? 'text-status-danger-fg' : undefined}
                  >
                    {n('dateLabel')}
                  </Label>
                  <NativeSelect
                    id={`${id}-date`}
                    name="sessionId"
                    value={sessionId}
                    className="w-full"
                    disabled={dates.state !== 'ready'}
                    aria-invalid={missingDate ? true : undefined}
                    aria-describedby={
                      missingDate
                        ? `${id}-date-error`
                        : dates.state === 'idle'
                          ? undefined
                          : `${id}-date-hint`
                    }
                    onChange={(event) => {
                      setSessionId(event.target.value);
                      setMissingDate(false);
                    }}
                  >
                    <NativeSelectOption value="">{n('dateChoose')}</NativeSelectOption>
                    {dates.state === 'ready'
                      ? dates.dates.map((date) => (
                          <NativeSelectOption key={date.id} value={date.id}>
                            {`${day(date.startsAt)} ${time(date.startsAt)}`}
                          </NativeSelectOption>
                        ))
                      : null}
                  </NativeSelect>
                  {dates.state === 'loading' ? (
                    <p
                      id={`${id}-date-hint`}
                      role="status"
                      className="text-[13px] text-muted-foreground"
                    >
                      {n('dateLoading')}
                    </p>
                  ) : null}
                  {dates.state === 'ready' && dates.dates.length === 0 ? (
                    <p id={`${id}-date-hint`} className="text-[13px] text-muted-foreground">
                      {n('dateNone')}
                    </p>
                  ) : null}
                  {missingDate ? (
                    <ErrorLine id={`${id}-date-error`}>{n('dateRequired')}</ErrorLine>
                  ) : null}
                </div>
              ) : null}
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-language`}>{n('languageLabel')}</Label>
                <NativeSelect
                  id={`${id}-language`}
                  name="language"
                  value={language}
                  className="w-full"
                  aria-describedby={`${id}-language-hint`}
                  onChange={(event) => setLanguage(event.target.value as Language)}
                >
                  {LANGUAGES.map((option) => (
                    <NativeSelectOption key={option} value={option}>
                      {n(`languageOptions.${option}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <p id={`${id}-language-hint`} className="text-[13px] text-muted-foreground">
                  {n('languageHint')}
                </p>
              </div>
              {failure ? <ErrorLine>{t(`errors.${failure}`)}</ErrorLine> : null}
            </>
          )}
        </div>
        <DialogFooter className="mx-0 mb-0 mt-3 rounded-none">
          {done ? (
            <DialogClose asChild>
              <Button type="button">{n('done')}</Button>
            </DialogClose>
          ) : (
            <>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {common('cancel')}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {n('create')}
              </Button>
            </>
          )}
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
