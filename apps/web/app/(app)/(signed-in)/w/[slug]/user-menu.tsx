'use client';

import { Button } from '@fivvi/ui/components/button';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { catalogLocale } from '../../../../../i18n/config';
import { LanguageOptions, languageNameKey } from '../../language/language-options';

/**
 * The user menu of a workspace's frame (`information-architecture.md §4.1`, F010): *Taal:
 * Nederlands* / *Language: English*, opening the two options with the current one marked.
 * Choosing one saves it on the account first, then asks the server for the page again: it
 * re-renders in the new language in place, without a reload, so what was typed stays (the route
 * guard writes the stored language into the cookie of the request). When the save fails the page
 * keeps its language and says so. *Mijn profiel* / *My profile* (F003) opens TW-09.
 */
export function UserMenu({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const t = useTranslations('userMenu');
  const current = catalogLocale(useLocale());
  const [open, setOpen] = useState(initiallyOpen);
  const [choosing, setChoosing] = useState(false);
  // The buttons wait for the page to hydrate: a click before that would be lost.
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

  function close() {
    setOpen(false);
    setChoosing(false);
    toggle.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) close();
  }

  const currentName = t(languageNameKey(current));

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape closes the open menu; the controls inside are buttons.
    <div ref={container} className="relative" onKeyDown={onKeyDown}>
      <Button
        ref={toggle}
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('label')}
        aria-expanded={open}
        aria-controls="user-menu"
        disabled={!ready}
        onClick={() => setOpen(!open)}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="13" cy="8" r="1.4" />
        </svg>
      </Button>
      {open ? (
        <div
          id="user-menu"
          className="absolute left-0 z-10 mt-1 grid min-w-48 gap-1 rounded-lg border bg-background p-1 shadow-md"
        >
          <Button asChild variant="ghost" className="justify-start">
            <Link href="/me/profile">{t('profile')}</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="justify-start"
            aria-expanded={choosing}
            aria-controls="user-menu-languages"
            onClick={() => setChoosing(!choosing)}
          >
            {t('language', { language: currentName })}
          </Button>
          {choosing ? <LanguageOptions id="user-menu-languages" onDone={close} /> : null}
        </div>
      ) : null}
    </div>
  );
}
