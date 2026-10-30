'use client';

import type { Locale } from '@fivvi/i18n';
import { Button } from '@fivvi/ui/components/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { catalogLocale } from '../../../../i18n/config';
import { saveLanguage } from './language-client';

/** The options, each written in its own language (`packages/i18n/GLOSSARY.md` §4.8). */
const OPTIONS = [
  { locale: 'nl-NL', lang: 'nl', name: 'languageNl' },
  { locale: 'en', lang: 'en', name: 'languageEn' },
] as const satisfies readonly { locale: Locale; lang: string; name: string }[];

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
  const router = useRouter();
  const current = catalogLocale(useLocale());
  const [open, setOpen] = useState(initiallyOpen);
  const [choosing, setChoosing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
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

  async function choose(locale: Locale) {
    if (locale === current) return close();
    setPending(true);
    setFailed(false);
    const { ok } = await saveLanguage(locale);
    setPending(false);
    if (!ok) return setFailed(true);
    close();
    router.refresh();
  }

  const currentName = t(OPTIONS.find((option) => option.locale === current)?.name ?? 'languageNl');

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
          {choosing ? (
            <ul id="user-menu-languages" className="grid gap-1">
              {OPTIONS.map(({ locale, lang, name }) => (
                <li key={locale}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    lang={lang}
                    aria-pressed={locale === current}
                    disabled={pending}
                    onClick={() => choose(locale)}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className={locale === current ? '' : 'invisible'}
                    >
                      <path d="M3 8.5l3 3 7-7" />
                    </svg>
                    {t(name)}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {failed ? (
            <p role="alert" className="px-2 py-1 text-sm text-status-danger-fg">
              {t('error')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
