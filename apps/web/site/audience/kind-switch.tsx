'use client';

import { createContext, type ReactNode, useContext, useState } from 'react';
import { classes, switchChoice, switchTrack } from '../home/classes';
import type { Kind } from './audience-data';

interface KindState {
  current: Kind;
  select: (kind: Kind) => void;
}

const KindContext = createContext<KindState | undefined>(undefined);

function useKind(): KindState {
  const state = useContext(KindContext);
  if (!state) throw new Error('The kind of studio belongs inside <KindProvider>.');
  return state;
}

/**
 * The kind of studio the Studios page shows (F064 AC2), pilates until the visitor picks yoga. The
 * choice changes the miniature, the screens and the word for the trainer; nothing is stored and
 * nothing is requested. The parts of the page that depend on it are `KindPanel`s.
 */
export function KindProvider({ children }: { children: ReactNode }) {
  const [current, select] = useState<Kind>('pilates');
  return <KindContext value={{ current, select }}>{children}</KindContext>;
}

/** The buttons of the switch, named by `label` (*Soort studio*). */
export function KindSwitch({
  label,
  options,
}: {
  label: string;
  options: readonly { kind: Kind; label: string }[];
}) {
  const { current, select } = useKind();
  return (
    <fieldset className="mt-6 min-w-0">
      <legend className="mb-2.5 text-[15px] font-semibold text-muted-foreground">{label}</legend>
      <div className={switchTrack}>
        {options.map((option) => (
          <button
            key={option.kind}
            type="button"
            aria-pressed={option.kind === current}
            onClick={() => select(option.kind)}
            className={switchChoice}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * What the page shows for one kind of studio. Every kind is in the HTML, so a visitor without
 * script has the whole text of both; the kind not chosen is hidden, and its images are lazy, so
 * they are not fetched until it is shown.
 */
export function KindPanel({
  kind,
  className,
  children,
}: {
  kind: Kind;
  className?: string;
  children: ReactNode;
}) {
  const { current } = useKind();
  return (
    <div
      hidden={kind !== current}
      className={classes(
        'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-500',
        className,
      )}
    >
      {children}
    </div>
  );
}
