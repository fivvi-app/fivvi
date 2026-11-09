'use client';

import { Button } from '@fivvi/ui/components/button';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useOpenAddClient } from './clients/add-client-dialog';

/**
 * **+ Nieuw** in the top bar of a workspace's frame (`information-architecture.md §4.1`): a menu
 * of what the person may create. Only *Klant* exists so far (F006, from `clients.manage`); the
 * sessions and classes join it with their features. *Klant* opens the quick-add dialog of the
 * list. Without anything to create the frame doesn't show the menu.
 */
export function NewMenu() {
  const t = useTranslations('workspaceNav');
  const openAddClient = useOpenAddClient();
  const [open, setOpen] = useState(false);
  // The button waits for the page to hydrate: a click before that would be lost.
  const [ready, setReady] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !open) return;
    setOpen(false);
    toggle.current?.focus();
  }

  if (!openAddClient) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape closes the open menu; the controls inside are buttons.
    <div ref={container} className="relative" onKeyDown={onKeyDown}>
      <Button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls="new-menu"
        disabled={!ready}
        onClick={() => setOpen(!open)}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M8 3v10M3 8h10" />
        </svg>
        {t('new')}
      </Button>
      {open ? (
        <ul
          id="new-menu"
          aria-label={t('newMenu')}
          className="absolute right-0 z-10 mt-1 grid min-w-40 gap-1 rounded-lg border bg-background p-1 shadow-md"
        >
          <li>
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                setOpen(false);
                openAddClient();
              }}
            >
              {t('newClient')}
            </Button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
