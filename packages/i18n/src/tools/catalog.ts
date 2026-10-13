import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { type Locale, locales } from '../config.ts';

/**
 * The raw catalog files of one package root, as parsed JSON. Checks and exporters take
 * this instead of reading files themselves, so tests can pass catalogs directly.
 */
export interface CatalogSet {
  messages: Record<Locale, unknown>;
  /** `comments.json`: translator context per key, passed on to the native catalogs. */
  comments: unknown;
}

export const catalogFile = (locale: Locale): string => `${locale}.json`;
export const commentsFile = 'comments.json';

export async function readCatalogSet(root: string): Promise<CatalogSet> {
  const read = async (file: string, optional = false): Promise<unknown> => {
    let text: string;
    try {
      text = await readFile(path.join(root, file), 'utf8');
    } catch (error) {
      if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`${file} is not valid JSON: ${(error as Error).message}`);
    }
  };
  const entries = await Promise.all(
    locales.map(async (locale) => [locale, await read(catalogFile(locale))] as const),
  );
  return {
    messages: Object.fromEntries(entries) as Record<Locale, unknown>,
    comments: await read(commentsFile, true),
  };
}

export interface FlatCatalog {
  /** Dot-path key → ICU message, in file order. */
  entries: Map<string, string>;
  errors: string[];
}

/** Flattens a nested catalog into dot-path keys (`{ hello: { title } }` → `hello.title`). */
export function flattenCatalog(tree: unknown, file: string): FlatCatalog {
  const entries = new Map<string, string>();
  const errors: string[] = [];
  const visit = (node: unknown, key: string) => {
    if (typeof node === 'string') {
      if (!key.includes('.')) {
        errors.push(`${file}: "${key}" must be inside a namespace, e.g. "screen.${key}"`);
      } else if (node.trim() === '') {
        errors.push(`${file}: "${key}" is empty`);
      } else {
        entries.set(key, node);
      }
    } else if (isPlainObject(node)) {
      if (key !== '' && Object.keys(node).length === 0) {
        errors.push(`${file}: "${key}" is an empty group`);
      }
      for (const [segment, child] of Object.entries(node)) {
        const childKey = key === '' ? segment : `${key}.${segment}`;
        if (!KEY_SEGMENT.test(segment)) {
          errors.push(
            `${file}: "${childKey}": key segments are lowerCamelCase letters and digits (${KEY_SEGMENT})`,
          );
          continue;
        }
        visit(child, childKey);
      }
    } else {
      errors.push(`${file}: "${key || '(root)'}" must be a string or an object of messages`);
    }
  };
  visit(tree, '');
  return { entries, errors };
}

/** One key segment: lowerCamelCase, e.g. `notFound`, `step2Title`. */
export const KEY_SEGMENT = /^[a-z][a-zA-Z0-9]*$/;

/** Android resource name for a key: `notFound.title` → `not_found_title`. */
export function androidName(key: string): string {
  return key
    .split('.')
    .map((segment) => segment.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`))
    .join('_');
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
