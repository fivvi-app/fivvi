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
import { type FormEvent, useId, useState } from 'react';
import type { GroupClass } from '../classes/classes-client';
import {
  type BookingLink,
  type CreateBookingLink,
  createBookingLink,
} from './booking-links-client';

type What = CreateBookingLink['scope'];
type Language = CreateBookingLink['language'];

/** What the form can make: the session scope (one class on a date) waits for a list of a class's dates. */
const WHAT = ['all', 'group', 'class'] as const satisfies readonly What[];
const LANGUAGES: readonly Language[] = ['visitor', 'nl', 'en'];

/**
 * The content of the **Nieuwe boekingslink** dialog (TW-07, F037, the Owner): *Wat* (*Alle
 * boekingen*, *Groepslessen* or *Eén les*, with a picker of the classes in the viewer's language)
 * and *Taal van de pagina*, with the hint that the visitor can always switch. **Link maken** gets
 * or makes the link (the API returns the active one of the same scope and language instead of a
 * second one); the dialog then says "Boekingslink gemaakt." and shows the link with **Link
 * kopiëren**. `created` runs with the link, so the page lists it.
 */
export function NewBookingLinkContent({
  workspaceId,
  classes,
  created,
  forbidden,
  signedOut,
}: {
  workspaceId: string;
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
  const [language, setLanguage] = useState<Language>('visitor');
  const [missingClass, setMissingClass] = useState(false);
  const [failure, setFailure] = useState<'noConnection' | 'generic' | null>(null);
  const [pending, setPending] = useState(false);
  // What the dialog says once the link exists: "Boekingslink gemaakt.", then "Link gekopieerd".
  const [done, setDone] = useState<{ url: string; message: string } | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    const needsClass = what === 'class';
    setMissingClass(needsClass && classId === '');
    if (needsClass && classId === '') return;
    setPending(true);
    const result = await createBookingLink(workspaceId, {
      scope: what,
      language,
      ...(needsClass ? { groupClassId: classId } : {}),
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
                  }}
                >
                  {WHAT.map((option) => (
                    <NativeSelectOption key={option} value={option}>
                      {n(`what.${option}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              {what === 'class' ? (
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
