import type { CatalogSet } from './catalog.ts';

type FlatMessages = Record<string, string>;

/** Builds a CatalogSet from flat dot-path messages, e.g. `{ 'hello.title': 'Hoi' }`. */
export function catalogSet(nl: FlatMessages, en: FlatMessages, comments = {}): CatalogSet {
  return { messages: { 'nl-NL': nest(nl), en: nest(en) }, comments };
}

export function nest(flat: FlatMessages): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const segments = key.split('.');
    const leaf = segments.pop() as string;
    let node = root;
    for (const segment of segments) {
      node[segment] ??= {};
      node = node[segment] as Record<string, unknown>;
    }
    node[leaf] = value;
  }
  return root;
}
