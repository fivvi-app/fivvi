'use client';

import { SIGNED_IN_HOME } from '@fivvi/auth/return-path';
import { Button } from '@fivvi/ui/components/button';
import { Input } from '@fivvi/ui/components/input';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useOpenAddClient } from './add-client-dialog';
import { type Client, searchClients } from './clients-client';

/** How long typing pauses before the list asks again. */
const TYPING_PAUSE_MS = 250;

type State =
  | { status: 'ready'; items: readonly Client[]; total: number }
  | { status: 'loading' }
  | { status: 'error' };

/**
 * TW-01 Klanten (F006): the workspace's clients sorted by name as the API gives them, with the
 * search field that matches name and email as you type (the API does the matching, ignoring case
 * and accents), and the add action. Each row is the name and, when there is one, the email address,
 * linking to the profile. States (`information-architecture.md §9.5`): skeleton rows while it
 * loads, the empty state with the add action, an error with *Opnieuw proberen*.
 */
export function ClientList({
  workspaceId,
  slug,
  initial,
}: {
  workspaceId: string;
  slug: string;
  /** The first page, read by the server. */
  initial: { items: readonly Client[]; total: number };
}) {
  const t = useTranslations('clients');
  const common = useTranslations('common');
  const openAddClient = useOpenAddClient();
  const [search, setSearch] = useState('');
  const [state, setState] = useState<State>({ status: 'ready', ...initial });
  // The buttons wait for the page to hydrate: a click before that would do nothing.
  const [ready, setReady] = useState(false);
  // Answers of earlier searches that arrive late are dropped.
  const latest = useRef(0);
  const first = useRef(true);

  useEffect(() => setReady(true), []);

  async function load(text: string) {
    const request = ++latest.current;
    setState({ status: 'loading' });
    const result = await searchClients(workspaceId, text);
    if (request !== latest.current) return;
    if (result.ok) return setState({ status: 'ready', items: result.items, total: result.total });
    // Not allowed (any more): the signed-in home knows where this person belongs.
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    setState({ status: 'error' });
  }

  // `load` only reads refs and the props of this page, so a search change is its one trigger.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => void load(search), TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const searching = search.trim() !== '';

  return (
    <main className="flex flex-1 justify-center p-4">
      <div className="grid w-full max-w-3xl content-start gap-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-2xl font-semibold">{t('title')}</h1>
          {openAddClient ? (
            <Button type="button" disabled={!ready} onClick={openAddClient}>
              {t('add')}
            </Button>
          ) : null}
        </div>
        <Input
          type="search"
          value={search}
          autoComplete="off"
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          onChange={(event) => setSearch(event.target.value)}
        />
        {state.status === 'loading' ? (
          <div>
            <p role="status" className="sr-only">
              {t('loading')}
            </p>
            <ul aria-hidden="true" className="grid gap-2">
              {[0, 1, 2, 3].map((row) => (
                <li key={row} className="h-14 animate-pulse rounded-lg border bg-muted" />
              ))}
            </ul>
          </div>
        ) : null}
        {state.status === 'error' ? (
          <div role="alert" className="grid justify-items-start gap-2">
            <p className="text-status-danger-fg">{t('loadError')}</p>
            <Button type="button" variant="outline" onClick={() => void load(search)}>
              {common('retry')}
            </Button>
          </div>
        ) : null}
        {state.status === 'ready' && state.items.length === 0 ? (
          <div className="grid justify-items-start gap-2">
            <p>{searching ? t('noResults') : t('empty')}</p>
            {!searching && openAddClient ? (
              <Button type="button" disabled={!ready} onClick={openAddClient}>
                {t('add')}
              </Button>
            ) : null}
          </div>
        ) : null}
        {state.status === 'ready' && state.items.length > 0 ? (
          <>
            <ul aria-label={t('listLabel')} className="grid gap-2">
              {state.items.map((client) => (
                <li key={client.id}>
                  <Link
                    href={`/w/${slug}/clients/${client.id}` as Route}
                    className="grid gap-0.5 rounded-lg border p-3 hover:bg-muted"
                  >
                    <span className="font-medium">{client.name}</span>
                    {client.email ? (
                      <span className="text-muted-foreground">{client.email}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
            {state.total > state.items.length ? (
              <p className="text-sm text-muted-foreground">
                {t('partial', { shown: state.items.length, total: state.total })}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
