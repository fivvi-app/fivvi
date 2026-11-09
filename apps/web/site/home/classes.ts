/** Joins class names, leaving out the ones that are not set. */
export function classes(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

/** The track of a switch (the *I am* switch, the platforms, the kind of studio): a pill with the choices in it. */
export const switchTrack =
  'inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-foreground/10 p-[3px]';

/**
 * A choice of a switch. The chosen one is a white pill with black text, and in dark mode too, which
 * is the owner's decision (`DECISIONS.md` §9).
 */
export const switchChoice =
  'rounded-full px-4.5 py-2.5 text-[15px] font-semibold whitespace-nowrap text-secondary-foreground aria-pressed:bg-card aria-pressed:text-card-foreground aria-pressed:shadow-md dark:aria-pressed:bg-foreground dark:aria-pressed:text-background';
