'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import type { Locale } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@fivvi/ui/components/dialog';
import { Input } from '@fivvi/ui/components/input';
import { Label } from '@fivvi/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@fivvi/ui/components/native-select';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createContext,
  type FormEvent,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  addClient,
  type Client,
  type EmailErrorKey,
  findExistingClient,
  type NameErrorKey,
} from './clients-client';

const OpenAddClient = createContext<(() => void) | null>(null);

/** Opens the quick-add dialog; `null` where the person may not add clients (no `clients.manage`). */
export function useOpenAddClient(): (() => void) | null {
  return useContext(OpenAddClient);
}

/**
 * The quick-add dialog of a workspace's frame (TW-01, F006): one dialog for the *Klant toevoegen*
 * button of the list and for **+ Nieuw** → *Klant* in the top bar, opened with `useOpenAddClient`.
 */
export function AddClientProvider({
  workspaceId,
  slug,
  defaultLocale,
  children,
}: {
  workspaceId: string;
  slug: string;
  /** The workspace's default communication language, named in the *Standaard (…)* option. */
  defaultLocale: Locale;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [openFn] = useState(() => () => setOpen(true));
  return (
    <OpenAddClient value={openFn}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <AddClientDialogContent
            workspaceId={workspaceId}
            slug={slug}
            defaultLocale={defaultLocale}
            close={() => setOpen(false)}
          />
        ) : null}
      </Dialog>
    </OpenAddClient>
  );
}

/** A client of the workspace that has the address that was typed. */
type Duplicate = Pick<Client, 'id' | 'name'>;

type FormLocale = '' | 'nl-NL' | 'en';

/**
 * The form: *Naam* (required, focused), *E-mailadres (optioneel)*, *Taal voor e-mails* with the
 * workspace default named and preselected, *Toevoegen*. Nothing is checked here: the API's answer
 * words the field messages, and a refused form keeps what was typed. A 409 offers the client that
 * has the address instead, in the same form, and creates nothing. After an add the dialog closes
 * and the new client's profile opens with a short confirmation.
 */
function AddClientDialogContent({
  workspaceId,
  slug,
  defaultLocale,
  close,
}: {
  workspaceId: string;
  slug: string;
  defaultLocale: Locale;
  close: () => void;
}) {
  const t = useTranslations('clients.addDialog');
  const names = useTranslations('clients.languageNames');
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [emailLocale, setEmailLocale] = useState<FormLocale>('');
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
    const result = await addClient(workspaceId, { name, email, emailLocale });
    if (result.ok) {
      close();
      return router.push(`/w/${slug}/clients/${result.client.id}?added=1` as Route);
    }
    if (result.reason === 'exists') {
      const existing = await findExistingClient(workspaceId, result.clientId, email);
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

  const emailMessage = duplicate ? 'duplicate' : emailError;

  return (
    <DialogContent aria-describedby="add-client-description">
      <form noValidate onSubmit={submit} className="grid gap-4">
        <DialogHeader>
          <DialogTitle className="font-display">{t('title')}</DialogTitle>
          <DialogDescription id="add-client-description">{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="add-client-name">{t('nameLabel')}</Label>
          <Input
            id="add-client-name"
            name="name"
            value={name}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'add-client-name-error' : undefined}
          />
          {nameError ? (
            <p id="add-client-name-error" role="alert" className="text-status-danger-fg">
              {t(`errors.${nameError}`)}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="add-client-email">{t('emailLabel')}</Label>
          <Input
            ref={emailInput}
            id="add-client-email"
            name="email"
            type="email"
            value={email}
            autoComplete="off"
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={emailMessage ? true : undefined}
            aria-describedby={emailMessage ? 'add-client-email-message' : undefined}
          />
          {emailError ? (
            <p id="add-client-email-message" role="alert" className="text-status-danger-fg">
              {t(`errors.${emailError}`)}
            </p>
          ) : null}
          {duplicate ? (
            <div id="add-client-email-message" role="alert" className="grid gap-2">
              <p className="text-status-danger-fg">{t('exists', { name: duplicate.name })}</p>
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
            </div>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="add-client-locale">{t('localeLabel')}</Label>
          <NativeSelect
            id="add-client-locale"
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
        {failed ? (
          <p role="alert" className="text-status-danger-fg">
            {t('errors.notSaved')}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t('cancel')}
            </Button>
          </DialogClose>
          <Button type="submit" disabled={!ready || pending}>
            {t('submit')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
