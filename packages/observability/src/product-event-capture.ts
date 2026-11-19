import { gunzipSync } from 'node:zlib';
import type { ProductEventTransport } from './product-events.ts';

/** An event as PostHog would receive it. */
export interface SentProductEvent {
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
  timestamp: string;
  uuid: string;
}

export interface ProductEventCaptureTransport extends ProductEventTransport {
  /** The URLs the batches would have been posted to, oldest first. */
  readonly urls: string[];
  /** Events that would have been sent, oldest first, exactly as they would leave the process. */
  readonly events: SentProductEvent[];
}

/**
 * Keeps PostHog batches in memory instead of sending them: the capture transport for tests,
 * like `createCaptureTransport()` for Sentry. Never talks to the network.
 */
export function createProductEventCaptureTransport(): ProductEventCaptureTransport {
  const urls: string[] = [];
  const events: SentProductEvent[] = [];
  return {
    urls,
    events,
    send: ({ url, headers, body }) => {
      const encoding = Object.entries(headers).find(([name]) => /^content-encoding$/i.test(name));
      const json =
        encoding?.[1] === 'gzip'
          ? gunzipSync(body).toString('utf8')
          : typeof body === 'string'
            ? body
            : new TextDecoder().decode(body);
      urls.push(url);
      events.push(...(JSON.parse(json) as { batch: SentProductEvent[] }).batch);
      return Promise.resolve({ statusCode: 200 });
    },
  };
}

/**
 * What Fivvi put in an event: its name, distinct id and properties. Not the `timestamp` and `uuid`
 * the PostHog client adds on its own (the wall clock and a time-ordered id), so a check that no
 * personal value was sent cannot trip over a clock that reads 18:00 or a date that matches a
 * fixture (#1494). Stringify this, not `events`, when a test looks for strings in what was sent.
 */
export function whatFivviSent(
  events: readonly SentProductEvent[],
): Pick<SentProductEvent, 'event' | 'distinct_id' | 'properties'>[] {
  return events.map(({ event, distinct_id, properties }) => ({ event, distinct_id, properties }));
}
