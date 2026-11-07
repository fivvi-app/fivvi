'use client';

import type { Locale } from '@fivvi/i18n';
import type { Route } from 'next';
import Link from 'next/link';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { type AudienceId, audiences } from './audiences';
import { classes } from './classes';
import { Device, Scene } from './devices';
import type { ShotId } from './screens';

/** What the switch needs to know about one audience: words, and the link when its page exists. */
export interface AudienceView {
  id: AudienceId;
  /** The button's label: *Sportschool met team*, *Studio*, *Personal trainer*, *Klant*. */
  label: string;
  /** The line under the headline. */
  short: string;
  /** *Bekijk wat Fivvi voor jou doet*, to the audience's page; none while the page does not exist. */
  link?: { href: Route; label: string };
}

interface AudienceState {
  current: AudienceId;
  select: (id: AudienceId) => void;
  views: readonly AudienceView[];
  locale: Locale;
  /** The description of every screen, by id. */
  alts: Record<ShotId, string>;
}

const AudienceContext = createContext<AudienceState | undefined>(undefined);

function useAudience(): AudienceState {
  const state = useContext(AudienceContext);
  if (!state) throw new Error('The audience parts belong inside <AudienceHero>.');
  return state;
}

/**
 * The home page's *I am* switch (F064 AC3): the one audience the visitor picks decides the
 * miniature next to the headline, the line under it and the screens below. The first audience is
 * the one in the HTML, so the page is whole without script; the parts of it are the components
 * below, which read the choice from here. Nothing is stored and nothing is requested.
 */
export function AudienceHero({
  locale,
  views,
  alts,
  children,
}: {
  locale: Locale;
  views: readonly AudienceView[];
  alts: Record<ShotId, string>;
  children: ReactNode;
}) {
  const [current, select] = useState<AudienceId>(views[0]?.id ?? 'gym');
  return (
    <AudienceContext value={{ current, select, views, locale, alts }}>{children}</AudienceContext>
  );
}

const rise =
  'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-500';

/** The buttons of the switch, named by `label` (*Ik ben*). */
export function AudienceSwitch({ label }: { label: string }) {
  const { current, select, views } = useAudience();
  return (
    <fieldset className="mt-6 min-w-0">
      <legend className="mb-2.5 text-[15px] font-semibold text-muted-foreground">{label}</legend>
      <div className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-foreground/10 p-[3px]">
        {views.map((view) => (
          <button
            key={view.id}
            type="button"
            aria-pressed={view.id === current}
            onClick={() => select(view.id)}
            className="rounded-full px-4.5 py-2.5 text-[15px] font-semibold whitespace-nowrap text-secondary-foreground aria-pressed:bg-card aria-pressed:text-card-foreground aria-pressed:shadow-md dark:aria-pressed:bg-foreground dark:aria-pressed:text-background"
          >
            {view.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** The miniature of the chosen audience, next to the headline. It stands on its own. */
export function AudienceArt() {
  const { current } = useAudience();
  return (
    <div key={current} className={classes('mx-auto w-full max-w-75 md:max-w-none', rise)}>
      <Scene
        id={audiences[current].scene}
        priority
        sizes="(max-width: 760px) 300px, 400px"
        className="aspect-square"
      />
    </div>
  );
}

/** The line about the chosen audience, with the link to its page when that page exists. */
export function AudienceCopy() {
  const { current, views } = useAudience();
  const view = views.find((candidate) => candidate.id === current);
  return (
    <div
      aria-live="polite"
      className="mt-4.5 flex min-h-15 flex-wrap items-center gap-x-5.5 gap-y-3"
    >
      <p className="max-w-[36em] flex-[1_1_320px] text-[19px] leading-[1.35] text-pretty text-foreground">
        {view?.short}
      </p>
      {view?.link ? (
        <Link
          href={view.link.href}
          className="inline-flex items-center gap-1.5 font-semibold text-accent-text hover:underline"
        >
          {view.link.label} <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </div>
  );
}

/**
 * The screens of the chosen audience: a laptop and a phone sharing one top and bottom edge, or
 * three phones in a row. The phones load at once, being the page's largest image; the laptop's
 * screen is lazy, since it is not shown at all on a phone.
 */
export function AudienceStage() {
  const { current, locale, alts } = useAudience();
  const { stage } = audiences[current];
  return (
    <div className="site-stage mt-6.5">
      {stage.kind === 'mix' ? (
        <div key={current} className={classes('site-stage-mix', rise)}>
          <Device id={stage.web} locale={locale} alt={alts[stage.web]} />
          <div className="site-stage-cell">
            <Device id={stage.phone} locale={locale} alt={alts[stage.phone]} priority />
          </div>
        </div>
      ) : (
        <div key={current} className={classes('site-stage-row', rise)}>
          {stage.phones.map((id) => (
            <Device key={id} id={id} locale={locale} alt={alts[id]} priority />
          ))}
        </div>
      )}
    </div>
  );
}
