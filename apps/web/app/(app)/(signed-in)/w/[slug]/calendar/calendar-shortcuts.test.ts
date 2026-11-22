import { describe, expect, it } from 'vitest';
import { shortcutFor } from './calendar-shortcuts';

// F014 WCAG 2.1.4 (spec #458, ticket #529): the single-letter shortcuts of the calendar are for the
// calendar only, never while typing, and ← → keep the sideways scroll of the grid.
const press = (
  key: string,
  modifiers: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey', true>> = {},
) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...modifiers,
});
/** An element inside the given kinds of element: `closest` finds the ones whose selector it is asked for. */
const inside = (...kinds: string[]) => ({
  closest: (selector: string) =>
    selector.split(',').some((part) => kinds.includes(part.trim())) ? {} : null,
});

describe('F014 the keyboard shortcuts of the calendar', () => {
  it('means today, previous, next, day, week, list and new', () => {
    const keys = ['t', 'ArrowLeft', 'ArrowRight', 'd', 'w', 'l', 'n'];
    expect(keys.map((key) => shortcutFor(press(key), inside()))).toEqual([
      'today',
      'previous',
      'next',
      'day',
      'week',
      'list',
      'new',
    ]);
  });

  it('leaves other keys and keys with a modifier alone', () => {
    expect(shortcutFor(press('x'), inside())).toBeUndefined();
    expect(shortcutFor(press('constructor'), inside())).toBeUndefined();
    expect(shortcutFor(press('t', { ctrlKey: true }), inside())).toBeUndefined();
    expect(shortcutFor(press('d', { metaKey: true }), inside())).toBeUndefined();
    expect(shortcutFor(press('ArrowLeft', { altKey: true }), inside())).toBeUndefined();
  });

  it('is silent while the person types or a dialog is open', () => {
    for (const kind of ['input', 'textarea', 'select', '[contenteditable]', '[role="dialog"]']) {
      expect(shortcutFor(press('n'), inside(kind)), kind).toBeUndefined();
    }
  });

  it('lets ← and → scroll the grid and the tables, but keeps the letters there', () => {
    for (const kind of ['[data-slot="week-grid"]', 'table']) {
      expect(shortcutFor(press('ArrowLeft'), inside(kind)), kind).toBeUndefined();
      expect(shortcutFor(press('ArrowRight'), inside(kind)), kind).toBeUndefined();
      expect(shortcutFor(press('w'), inside(kind)), kind).toBe('week');
    }
  });
});
