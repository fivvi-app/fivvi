'use client';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@fivvi/ui/components/dialog';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { Studio } from './client-studio';
import { StudioMark } from './studio-mark';
import { AddStudio, StudiosList } from './studio-sheet';

/** The page the switcher is on: *Boeken*, where the studios are per studio (`DECISIONS.md` §5b). */
const BOOK_PATH = '/my/book';

/**
 * The studio switcher in the header of *Boeken* (F030, `DECISIONS.md` §5b): the current studio's
 * mark, its name and ⌃⌄. It opens *Je studio's*, a sheet from the bottom of the window, where
 * the client chooses another studio or reads how to add one. Nowhere else has it: *Home* and
 * *Profiel* show only the large title. A client of no studio has nothing to switch.
 */
export function StudioSwitcher({
  studios,
  current,
}: {
  studios: readonly Studio[];
  /** The URL name of the studio *Boeken* shows. */
  current: string;
}) {
  const t = useTranslations('clientWeb.studios');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  // The button waits for the page to hydrate: a click before that would be lost.
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  /** Ends the sheet, which always opens on the list. */
  const change = (next: boolean) => {
    setOpen(next);
    if (!next) setAdding(false);
  };

  const studio = studios.find(({ slug }) => slug === current);
  if (pathname !== BOOK_PATH || !studio) return null;

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <button
          type="button"
          disabled={!ready}
          aria-label={t('switcher', { name: studio.name })}
          className="flex min-h-11 max-w-[60%] items-center gap-2 rounded-full bg-foreground/10 py-1 ps-1.5 pe-3 text-[15px] font-semibold"
        >
          <StudioMark name={studio.name} size="sm" />
          <span className="truncate">{studio.name}</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          >
            <path d="m8 9 4-4 4 4M8 15l4 4 4-4" />
          </svg>
        </button>
      </DialogTrigger>
      <DialogContent className="top-auto bottom-0 left-0 max-h-[85dvh] max-w-none translate-x-0 translate-y-0 gap-4 overflow-y-auto rounded-t-[26px] rounded-b-none bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:left-1/2 sm:max-w-md sm:-translate-x-1/2">
        <div className="flex items-center justify-between gap-3">
          <DialogTitle className="text-[22px] leading-7 font-bold">
            {adding ? t('add') : t('yours')}
          </DialogTitle>
          <DialogClose
            aria-label={t('close')}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-foreground/10"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
              className="size-5"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </DialogClose>
        </div>
        <DialogDescription className="sr-only">
          {adding ? t('addHint') : t('yours')}
        </DialogDescription>
        {adding ? (
          <AddStudio close={() => change(false)} />
        ) : (
          <StudiosList studios={studios} current={current} onAdd={() => setAdding(true)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
