'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import type { Locale } from '@fivvi/i18n';
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
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  type Client,
  type ClientFormInput,
  type EmailErrorKey,
  findExistingClient,
  type NameErrorKey,
  type SaveClientResult,
} from './clients-client';

type FormLocale = ClientFormInput['emailLocale'];

/** A client of the workspace that has the address that was typed. */
type Duplicate = Pick<Client, 'id' | 'name'>;

/**
 * The form of a client, for adding one (TW-01) and editing one (TW-02): *Naam* (required,
 * focused), *E-mailadres* (required, never cleared), *Taal voor e-mails* with the workspace default
 * named, and the submit button. A blank name or email is refused before anything is sent, the rest
 * by the API; the field messages sit under the fields, and a refused or failed form keeps what was
 * typed. A 409 offers the client that has the address instead, in the same form, and saves
 * nothing. `save` sends the form (add or edit); `saved` runs after it succeeded.
 */
export function ClientFormDialogContent({
  workspaceId,
  slug,
  defaultLocale,
  initial,
  title,
  description,
  submitLabel,
  save,
  saved,
  close,
}: {
  workspaceId: string;
  slug: string;
  defaultLocale: Locale;
  /** What the form starts with: empty for an add, the client for an edit. */
  initial: ClientFormInput;
  title: string;
  /** The line under the title; none for an edit. */
  description?: string;
  submitLabel: string;
  save: (input: ClientFormInput) => Promise<SaveClientResult>;
  saved: (client: Client) => void;
  close: () => void;
}) {
  const t = useTranslations('clients.addDialog');
  const names = useTranslations('clients.languageNames');
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [emailLocale, setEmailLocale] = useState<FormLocale>(initial.emailLocale);
  const [nameError, setNameError] = useState<NameErrorKey | null>(null);
  const [emailError, setEmailError] = useState<EmailErrorKey | null>(null);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNameError(null);
    setEmailError(null);
    setDuplicate(null);
    setFailed(false);
    const result = await save({ name, email, emailLocale });
    if (result.ok) return saved(result.client);
    if (result.reason === 'exists') {
      const existing = await findExistingClient(workspaceId, result.clientId);
      setPending(false);
      if (!existing) return setFailed(true);
      return setDuplicate({ id: existing.id, name: existing.name });
    }
    setPending(false);
    // Not allowed (any more): the signed-in home knows where this person belongs.
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    if (result.reason === 'fields') {
      setNameError(result.name ?? null);
      setEmailError(result.email ?? null);
      return;
    }
    setFailed(true);
  }

  function chooseAnotherEmail() {
    setDuplicate(null);
    emailInput.current?.focus();
    emailInput.current?.select();
  }

  const emailMessage = emailError
    ? t(`errors.${emailError}`)
    : duplicate
      ? t('exists', { name: duplicate.name })
      : undefined;

  return (
    <DialogContent
      aria-describedby={description ? 'client-form-description' : undefined}
      className="gap-0 rounded-2xl p-5.5 sm:max-w-115"
    >
      <form noValidate onSubmit={submit} className="grid gap-4">
        <DialogHeader>
          <DialogTitle className="text-lg leading-snug font-semibold">{title}</DialogTitle>
          {description ? (
            <DialogDescription id="client-form-description">{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <Field
          id="client-form-name"
          name="name"
          label={t('nameLabel')}
          value={name}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
          error={nameError ? t(`errors.${nameError}`) : undefined}
        />
        <div className="grid gap-2">
          <Field
            ref={emailInput}
            id="client-form-email"
            name="email"
            type="email"
            label={t('emailLabel')}
            value={email}
            autoComplete="off"
            onChange={(event) => setEmail(event.target.value)}
            error={emailMessage}
          />
          {duplicate ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  close();
                  router.push(`/w/${slug}/clients/${duplicate.id}` as Route);
                }}
              >
                {t('openExisting', { name: duplicate.name })}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={chooseAnotherEmail}>
                {t('otherEmail')}
              </Button>
            </div>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="client-form-locale">{t('localeLabel')}</Label>
          <NativeSelect
            id="client-form-locale"
            name="emailLocale"
            value={emailLocale}
            className="w-full"
            onChange={(event) => setEmailLocale(event.target.value as FormLocale)}
          >
            <NativeSelectOption value="">
              {t('localeDefault', { language: names(defaultLocale === 'nl-NL' ? 'nl' : 'en') })}
            </NativeSelectOption>
            <NativeSelectOption value="nl-NL">{t('localeNl')}</NativeSelectOption>
            <NativeSelectOption value="en">{t('localeEn')}</NativeSelectOption>
          </NativeSelect>
        </div>
        {failed ? <ErrorLine>{t('errors.notSaved')}</ErrorLine> : null}
        <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0 pt-2">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t('cancel')}
            </Button>
          </DialogClose>
          <Button type="submit" disabled={!ready || pending}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
