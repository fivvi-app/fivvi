/** What a single-letter shortcut of the calendar does (F014: T, ← →, D, W, L, N). */
export type Shortcut = 'today' | 'previous' | 'next' | 'day' | 'week' | 'list' | 'new';

/** Where the person is typing or choosing: a shortcut must never take the key from them. */
const TYPING = 'input, textarea, select, [contenteditable], [role="dialog"]';
/** Where ← and → scroll sideways: the grid of the week and day views, and the tables of the list. */
const SCROLLS = '[data-slot="week-grid"], table';

const KEYS: Record<string, Shortcut> = {
  t: 'today',
  ArrowLeft: 'previous',
  ArrowRight: 'next',
  d: 'day',
  w: 'week',
  l: 'list',
  n: 'new',
};

/**
 * The shortcut a key press means, or `undefined` when it is for something else (WCAG 2.1.4): never
 * with a modifier, never while the person is typing or a dialog is open, and ← → leave the sideways
 * scroll of the grid and the tables alone. The calendar only asks while focus is inside it.
 */
export function shortcutFor(
  event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean },
  target: { closest: (selector: string) => unknown } | null,
): Shortcut | undefined {
  if (event.metaKey || event.ctrlKey || event.altKey) return undefined;
  const shortcut = Object.hasOwn(KEYS, event.key) ? KEYS[event.key] : undefined;
  if (!shortcut) return undefined;
  if (target?.closest(TYPING)) return undefined;
  const arrow = shortcut === 'previous' || shortcut === 'next';
  if (arrow && target?.closest(SCROLLS)) return undefined;
  return shortcut;
}
