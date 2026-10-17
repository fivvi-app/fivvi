import { type Locale, type MessageKey, messages } from '@trainer-hub/i18n';
import type { ApiClient } from './api-client';

/** The hello page's greeting: a catalog key to render, or the error state. */
export type Greeting = { status: 'loaded'; key: MessageKey } | { status: 'failed' };

/**
 * Asks `GET /v1/hello` for the greeting in `locale` (#94). Any failure, an error response, a
 * key the catalog doesn't have, or a call that throws, becomes the error state, like the
 * native apps: the page never shows a key, a stack trace or an internal message. The API
 * reports its own errors; a call that throws is logged here.
 */
export async function loadGreeting(api: ApiClient, locale: Locale): Promise<Greeting> {
  try {
    const { data } = await api.GET('/v1/hello', { params: { query: { locale } } });
    if (data && isMessageKey(data.greetingKey, locale)) {
      return { status: 'loaded', key: data.greetingKey };
    }
  } catch (error) {
    console.error('Hello greeting failed:', error);
  }
  return { status: 'failed' };
}

function isMessageKey(key: string, locale: Locale): key is MessageKey {
  let node: unknown = messages[locale];
  for (const segment of key.split('.')) {
    if (typeof node !== 'object' || node === null || !Object.hasOwn(node, segment)) return false;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string';
}
