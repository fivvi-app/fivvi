'use client';

import type { Locale } from '@fivvi/i18n';
import { useState } from 'react';
import { classes } from './classes';
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

/** Each group has a colour of the product: owners and trainers the private one, clients the group one. */
const tint = {
  owners: 'bg-session-private-bg dark:bg-background',
  clients: 'bg-session-group-bg dark:bg-background',
} as const;

/**
 * The platforms: owners and trainers, or clients, each on iPhone, Android and in the browser
 * (`DECISIONS.md` §9). The first group is the one in the HTML.
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
  const hasWide = group.cards.some((card) => card.wide);
  return (
    <>
      <fieldset className="mt-6 min-w-0">
        <legend className="sr-only">{label}</legend>
        <div className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-foreground/10 p-[3px]">
          {groups.map(({ id, name }) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === group.id}
              onClick={() => setCurrent(id)}
              className="rounded-full px-4.5 py-2.5 text-[15px] font-semibold whitespace-nowrap text-secondary-foreground aria-pressed:bg-card aria-pressed:text-card-foreground aria-pressed:shadow-md"
            >
              {name}
            </button>
          ))}
        </div>
      </fieldset>
      <div
        key={group.id}
        className={classes(
          'mt-6 grid grid-cols-1 gap-3.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-500 min-[621px]:grid-cols-2',
          hasWide ? 'min-[981px]:grid-cols-4' : 'min-[981px]:grid-cols-3',
        )}
      >
        {group.cards.map((card) => (
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
                tint[group.id],
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
    </>
  );
}
