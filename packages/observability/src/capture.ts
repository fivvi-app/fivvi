import { type Event, parseEnvelope, type SerializedCheckIn } from '@sentry/core';
import type { ErrorTransport } from './transport.ts';

export interface CaptureTransport extends ErrorTransport {
  /** Events that would have been sent, oldest first, exactly as they would leave the process. */
  readonly events: Event[];
  /** Cron monitor check-ins that would have been sent, oldest first. */
  readonly checkIns: SerializedCheckIn[];
  /** The type of every envelope item that would have been sent (`event`, `session`, …), in order. */
  readonly itemTypes: string[];
}

/**
 * Keeps envelopes in memory instead of sending them: the capture transport for tests
 * (TESTING.md §5.4), like the email package's memory transport. Never talks to the network.
 */
export function createCaptureTransport(): CaptureTransport {
  const events: Event[] = [];
  const checkIns: SerializedCheckIn[] = [];
  const itemTypes: string[] = [];
  return {
    events,
    checkIns,
    itemTypes,
    send: ({ body }) => {
      const [, items] = parseEnvelope(body);
      for (const [header, payload] of items) {
        itemTypes.push(header.type);
        if (header.type === 'event') events.push(payload as Event);
        if (header.type === 'check_in') checkIns.push(payload as SerializedCheckIn);
      }
      return Promise.resolve({ statusCode: 200 });
    },
  };
}
