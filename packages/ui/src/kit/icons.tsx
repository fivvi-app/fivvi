import type { ComponentProps } from 'react';

/** A warning triangle with an exclamation mark. Decorative: the message beside it says what is wrong. */
export function WarningIcon(props: ComponentProps<'svg'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

const outline = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** A chevron pointing right: the end of a row that opens something. Decorative. */
export function ChevronRightIcon(props: ComponentProps<'svg'>) {
  return (
    <svg {...outline} aria-hidden="true" {...props}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** A magnifying glass for a search field. Decorative: the field has its own name. */
export function SearchIcon(props: ComponentProps<'svg'>) {
  return (
    <svg {...outline} aria-hidden="true" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/** A person with a plus: adding a person. Decorative: the button has its label. */
export function PersonPlusIcon(props: ComponentProps<'svg'>) {
  return (
    <svg {...outline} aria-hidden="true" {...props}>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0" />
      <path d="M19 8v6" />
      <path d="M16 11h6" />
    </svg>
  );
}
