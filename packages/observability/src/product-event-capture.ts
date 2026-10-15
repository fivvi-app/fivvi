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
