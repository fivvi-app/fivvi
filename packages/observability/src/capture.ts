import { type Event, parseEnvelope } from '@sentry/core';
import type { ErrorTransport } from './transport.ts';

export interface CaptureTransport extends ErrorTransport {
  /** Events that would have been sent, oldest first, exactly as they would leave the process. */
  readonly events: Event[];
}

/**
 * Keeps envelopes in memory instead of sending them: the capture transport for tests
 * (TESTING.md §5.4), like the email package's memory transport. Never talks to the network.
 */
export function createCaptureTransport(): CaptureTransport {
  const events: Event[] = [];
  return {
    events,
    send: ({ body }) => {
      const [, items] = parseEnvelope(body);
      for (const [header, payload] of items) {
        if (header.type === 'event') events.push(payload as Event);
      }
      return Promise.resolve({ statusCode: 200 });
    },
  };
}
