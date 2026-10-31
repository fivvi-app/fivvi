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

/** How long a load takes before the list says so (`information-architecture.md §9.5`). */
const SLOW_LOAD_MS = 10_000;

interface Shown {
  items: readonly Client[];
  total: number;
}

const EMPTY: Shown = { items: [], total: 0 };

type State = ({ status: 'ready' } & Shown) | { status: 'loading' } | { status: 'error' };

/**
 * TW-01 Klanten (F006): the workspace's clients sorted by name as the API gives them, with the
 * search field that matches name and email as you type (the API does the matching, ignoring case
 * and accents), and the add action. Each row is the name and, when there is one, the email address,
 * linking to the profile. States (`information-architecture.md §9.5`): skeleton rows while it
 * loads (and, after 10 s, a line that it takes longer than usual), the empty state with the add
 * action, an error with *Opnieuw proberen* that keeps the list that was already shown.
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
  // What was last shown: a failed search keeps it on screen, under the error.
  const [shown, setShown] = useState<Shown>(initial);
  const [slow, setSlow] = useState(false);
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
    if (result.ok) {
      setShown({ items: result.items, total: result.total });
      return setState({ status: 'ready', items: result.items, total: result.total });
    }
    // Not allowed (any more): the signed-in home knows where this person belongs.
    if (result.reason === 'home') return window.location.replace(SIGNED_IN_HOME);
    setState({ status: 'error' });
  }

  // After 10 s of loading, the skeleton gets a line of text.
  const loading = state.status === 'loading';
  useEffect(() => {
    setSlow(false);
    if (!loading) return;
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => clearTimeout(timer);
  }, [loading]);

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
  // The list on screen: the loaded one, or, behind an error, the one that was shown before it.
  const list: Shown = state.status === 'ready' ? state : state.status === 'error' ? shown : EMPTY;

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
            {slow ? (
              <p role="status" className="mb-2 text-muted-foreground">
                {common('loadingSlow')}
              </p>
            ) : null}
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
        {list.items.length > 0 ? (
          <>
            <ul aria-label={t('listLabel')} className="grid gap-2">
              {list.items.map((client) => (
                <li key={client.id}>
                  <Link
                    href={`/w/${slug}/clients/${client.id}` as Route}
                    className="grid gap-0.5 rounded-lg border p-3 hover:bg-muted"
                  >
                    <span className="font-medium">{client.name}</span>
                    {client.email ? (
                      <>
                        {/* A pause between the name and the address in the link's spoken name. */}
                        <span className="sr-only">, </span>
                        <span className="text-muted-foreground">{client.email}</span>
                      </>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
            {list.total > list.items.length ? (
              <p className="text-sm text-muted-foreground">
                {t('partial', { shown: list.items.length, total: list.total })}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
