'use client';

import type { Locale } from '@fivvi/i18n';
import { useState } from 'react';
import { classes, switchChoice, switchTrack } from './classes';
import { Device } from './devices';
import type { ShotId } from './screens';

export interface PlatformCard {
  shot: ShotId;
  title: string;
  text: string;
  /** The description of the screen. */
  alt: string;
  /** The laptop screen takes two columns. */
  wide?: boolean;
}

export interface PlatformGroup {
  id: 'owners' | 'clients';
  name: string;
  cards: readonly PlatformCard[];
}

/** Each group has a colour of the product, as 7% of it in both modes: owners and trainers the private one, clients the group one. */
const tint = {
  owners: 'bg-session-private-solid/7',
  clients: 'bg-session-group-solid/7',
} as const;

/**
 * The platforms: owners and trainers, or clients, each on iPhone, Android and in the browser
 * (`DECISIONS.md` §9). Both groups are in the HTML, so the text is there without script; the one
 * not chosen is hidden, and the first is shown.
 */
export function PlatformSwitch({
  label,
  groups,
  locale,
}: {
  label: string;
  groups: readonly PlatformGroup[];
  locale: Locale;
}) {
  const [current, setCurrent] = useState(groups[0]?.id);
  const group = groups.find((candidate) => candidate.id === current) ?? groups[0];
  if (!group) return null;
  return (
    <>
      <fieldset className="mt-6 min-w-0">
        <legend className="sr-only">{label}</legend>
        <div className={switchTrack}>
          {groups.map(({ id, name }) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === group.id}
              onClick={() => setCurrent(id)}
              className={switchChoice}
            >
              {name}
            </button>
          ))}
        </div>
      </fieldset>
      {groups.map((candidate) => (
        <div
          key={candidate.id}
          hidden={candidate.id !== group.id}
          className={classes(
            'mt-6 grid grid-cols-1 gap-3.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-500 min-[621px]:grid-cols-2',
            candidate.cards.some((card) => card.wide)
              ? 'min-[981px]:grid-cols-4'
              : 'min-[981px]:grid-cols-3',
          )}
        >
          {candidate.cards.map((card) => (
            <article
              key={card.shot}
              className={classes(
                'flex flex-col overflow-hidden rounded-card bg-card',
                card.wide && 'min-[621px]:col-span-full min-[981px]:col-span-2',
              )}
            >
              <div className="min-h-0 px-6 pt-6 pb-5 min-[621px]:min-h-34">
                <h3 className="text-[21px] leading-[1.15] font-bold tracking-[-0.015em]">
                  {card.title}
                </h3>
                <p className="mt-1.5 text-[15px] leading-[1.38] text-pretty text-muted-foreground">
                  {card.text}
                </p>
              </div>
              <div
                className={classes(
                  '@container flex h-95 flex-1 items-start overflow-hidden pt-8 min-[621px]:h-110',
                  tint[candidate.id],
                  card.wide ? 'justify-start pl-4.5 min-[621px]:pl-8' : 'justify-center',
                )}
              >
                <Device
                  id={card.shot}
                  locale={locale}
                  alt={card.alt}
                  className={
                    card.wide
                      ? 'w-170 max-w-none flex-none min-[621px]:w-220'
                      : '[--phone-w:min(76cqw,290px)]'
                  }
                />
              </div>
            </article>
          ))}
        </div>
      ))}
    </>
  );
}
