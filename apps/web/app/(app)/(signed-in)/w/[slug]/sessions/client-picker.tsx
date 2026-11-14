'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import type { Locale } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import { Input } from '@fivvi/ui/components/input';
import { Label } from '@fivvi/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@fivvi/ui/components/native-select';
import { ErrorLine } from '@fivvi/ui/kit/error-line';
import { Field } from '@fivvi/ui/kit/field';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import {
  addClient,
  type Client,
  type ClientFormInput,
  type EmailErrorKey,
  findExistingClient,
  type NameErrorKey,
  searchClients,
} from '../clients/clients-client';

/** The most results the picker lists; the search narrows the rest (PS-02 shows the first few). */
const SHOWN = 8;

/**
 * PS-02 *Klant kiezen* inside PS-01 (F020, F006): a search on name and email (the clients route
 * does the matching), the first clients by name while the field is empty, and **+ Nieuwe klant**
 * for a person who may add one, which opens the quick add right here. A 409 on the email address
 * offers the client that has it (*Die gebruiken*). Choosing shows the client with *Wijzigen*.
 */
export function ClientPicker({
  workspaceId,
  defaultLocale,
  canAdd,
  value,
  onChange,
  error,
}: {
  workspaceId: string;
  /** The workspace's default language: named in the new client's language field. */
  defaultLocale: Locale;
  /** The person has `clients.manage`. */
  canAdd: boolean;
  value: Client | null;
  onChange: (client: Client | null) => void;
  error?: string;
}) {
  const t = useTranslations('sessions.form');
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Client[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [failed, setFailed] = useState(false);

  // The search follows the typing a moment later; an answer to an older search is dropped.
  useEffect(() => {
    if (value || adding) return;
    let current = true;
    const timer = setTimeout(
      async () => {
        const result = await searchClients(workspaceId, query);
        if (!current) return;
        if (result.ok) {
          setFailed(false);
          setResults(result.items.slice(0, SHOWN));
        } else if (result.reason === 'home') {
          window.location.replace(SIGNED_IN_HOME);
        } else {
          setFailed(true);
        }
      },
      query ? 200 : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [workspaceId, query, value, adding]);

  if (value) {
    return (
      <div className="grid gap-1.5">
        <span className="text-sm leading-none font-medium">{t('clientLabel')}</span>
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <span className="min-w-0 text-sm">
            <span className="block truncate font-medium">{value.name}</span>
            <span className="block truncate text-[13px] text-muted-foreground">{value.email}</span>
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            {t('clientChange')}
          </Button>
        </div>
      </div>
    );
  }

  if (adding) {
    return (
      <NewClient
        workspaceId={workspaceId}
        defaultLocale={defaultLocale}
        initialName={query}
        chosen={(client) => {
          setAdding(false);
          onChange(client);
        }}
        cancel={() => setAdding(false)}
      />
    );
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={inputId} className={error ? 'text-status-danger-fg' : undefined}>
        {t('clientLabel')}
      </Label>
      <Input
        id={inputId}
        type="search"
        autoComplete="off"
        placeholder={t('clientSearch')}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {error ? <ErrorLine id={`${inputId}-error`}>{error}</ErrorLine> : null}
      {failed ? <ErrorLine>{t('loadFailed')}</ErrorLine> : null}
      {results ? (
        <ul aria-label={t('clientResults')} className="grid rounded-lg border">
          {results.map((client) => (
            <li key={client.id} className="border-b last:border-b-0">
              <button
                type="button"
                className="grid w-full gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted"
                onClick={() => onChange(client)}
              >
                <span className="font-medium">{client.name}</span>
                <span className="text-[13px] text-muted-foreground">{client.email}</span>
              </button>
            </li>
          ))}
          {results.length === 0 ? (
            <li className="px-3 py-2 text-[13px] text-muted-foreground">{t('clientNone')}</li>
          ) : null}
          {canAdd ? (
            <li>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm font-semibold hover:bg-muted focus-visible:bg-muted"
                onClick={() => setAdding(true)}
              >
                {query.trim() ? t('clientNewNamed', { query: query.trim() }) : t('clientNew')}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

/** The quick add of a client (F006) as PS-02 shows it: name, email address and language. */
function NewClient({
  workspaceId,
  defaultLocale,
  initialName,
  chosen,
  cancel,
}: {
  workspaceId: string;
  defaultLocale: Locale;
  initialName: string;
  chosen: (client: Client) => void;
  cancel: () => void;
}) {
  const t = useTranslations('sessions.form');
  const add = useTranslations('clients.addDialog');
  const names = useTranslations('clients.languageNames');
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState('');
  const [emailLocale, setEmailLocale] = useState<ClientFormInput['emailLocale']>('');
  const [nameError, setNameError] = useState<NameErrorKey | null>(null);
  const [emailError, setEmailError] = useState<EmailErrorKey | null>(null);
  const [duplicate, setDuplicate] = useState<Client | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => nameInput.current?.focus(), []);

  async function submit() {
    setPending(true);
    setNameError(null);
    setEmailError(null);
    setDuplicate(null);
    setFailed(false);
    const result = await addClient(workspaceId, { name, email, emailLocale });
    if (result.ok) return chosen(result.client);
    setPending(false);
    if (result.reason === 'exists') {
      const existing = await findExistingClient(workspaceId, result.clientId);
      return existing ? setDuplicate(existing) : setFailed(true);
    }
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    if (result.reason === 'fields') {
      setNameError(result.name ?? null);
      setEmailError(result.email ?? null);
      return;
    }
    setFailed(true);
  }

  return (
    <fieldset className="grid gap-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-semibold">{t('newClientTitle')}</legend>
      <Field
        ref={nameInput}
        id="new-client-name"
        label={add('nameLabel')}
        value={name}
        autoComplete="off"
        onChange={(event) => setName(event.target.value)}
        error={nameError ? add(`errors.${nameError}`) : undefined}
      />
      <Field
        id="new-client-email"
        type="email"
        label={add('emailLabel')}
        value={email}
        autoComplete="off"
        onChange={(event) => setEmail(event.target.value)}
        error={
          emailError
            ? add(`errors.${emailError}`)
            : duplicate
              ? t('clientExists', { name: duplicate.name })
              : undefined
        }
      />
      {duplicate ? (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => chosen(duplicate)}>
            {t('clientUse')}
          </Button>
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor="new-client-locale">{add('localeLabel')}</Label>
        <NativeSelect
          id="new-client-locale"
          value={emailLocale}
          className="w-full"
          onChange={(event) => setEmailLocale(event.target.value as ClientFormInput['emailLocale'])}
        >
          <NativeSelectOption value="">
            {add('localeDefault', { language: names(defaultLocale === 'nl-NL' ? 'nl' : 'en') })}
          </NativeSelectOption>
          <NativeSelectOption value="nl-NL">{add('localeNl')}</NativeSelectOption>
          <NativeSelectOption value="en">{add('localeEn')}</NativeSelectOption>
        </NativeSelect>
      </div>
      {failed ? <ErrorLine>{add('errors.notSaved')}</ErrorLine> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={cancel}>
          {t('newClientCancel')}
        </Button>
        <Button type="button" disabled={pending} onClick={submit}>
          {t('newClientAdd')}
        </Button>
      </div>
    </fieldset>
  );
}
