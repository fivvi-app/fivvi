import http from 'node:http';
import https from 'node:https';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createCaptureTransport } from './capture.ts';
import { type CatalogEvent, defineCatalog, property } from './event-schema.ts';
import { createProductEventCaptureTransport } from './product-event-capture.ts';
import {
  anonymousDistinctId,
  createTracker,
  ProductEventError,
  type ProductEvents,
  type ProductEventTransport,
} from './product-events.ts';
import { createErrorReporter } from './reporter.ts';

// Synthetic data only. A test catalog: the real one (catalog.ts) has no events until the MVP
// features add theirs.
const USER_ID = '6f1c6c2e-1c1e-4a51-9f53-0d7e7c1f1a11';
const BOOKING_ID = '3f2e1d0c-9b8a-4765-8432-10fedcba9876';
const CATALOG = defineCatalog({
  booking_confirmed: {
    booking_id: property.uuid(),
    channel: property.enum(['booking_page', 'trainer']),
    first_booking: property.boolean(),
    spots_left: property.number(),
    occurrence_date: property.date(),
    confirmed_at: property.dateTime(),
    organization_id: property.optional(property.uuid()),
  },
});
const PROPERTIES = {
  booking_id: BOOKING_ID,
  channel: 'booking_page',
  first_booking: true,
  spots_left: 3,
  occurrence_date: '2026-10-16',
  confirmed_at: '2026-10-15T18:30:00.000Z',
} as const;

const CLIENT_NAME = 'Anna de Vries';
const EMAIL = 'anna.devries@example.com';
const NOTE = 'Knee injury, avoid deep squats';

const PRODUCTION = { RAILWAY_ENVIRONMENT_NAME: 'production' };
const WITH_KEY = { ...PRODUCTION, POSTHOG_KEY: 'phc_test' };
const WITH_DSN = { ...PRODUCTION, SENTRY_DSN: 'https://public@o0.ingest.de.sentry.io/1' };

/** What posthog-node adds to every event about itself. Nothing about the user. */
const SDK_PROPERTIES = {
  $lib: 'posthog-node',
  $lib_version: expect.any(String),
  $is_server: true,
  $geoip_disable: true,
};

function setup(env: Record<string, string> = WITH_KEY, transport?: ProductEventTransport) {
  const capture = createProductEventCaptureTransport();
  const sentry = createCaptureTransport();
  const errorReporter = createErrorReporter({ env: WITH_DSN, transport: sentry });
  const productEvents = createTracker(CATALOG, {
    env,
    transport: transport ?? capture,
    errorReporter,
  });
  return { transport: capture, sentry, errorReporter, productEvents };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('E009 product events', () => {
  it('AC7: sends a catalog event with exactly its properties to PostHog EU', async () => {
    const { transport, productEvents } = setup();

    productEvents.track({
      event: 'booking_confirmed',
      distinctId: USER_ID,
      properties: PROPERTIES,
    });
    await productEvents.flush();

    expect(productEvents.enabled).toBe(true);
    expect(transport.urls).toEqual(['https://eu.i.posthog.com/batch/']);
    expect(transport.events).toEqual([
      {
        event: 'booking_confirmed',
        distinct_id: USER_ID,
        properties: { ...PROPERTIES, ...SDK_PROPERTIES },
        timestamp: expect.any(String),
        uuid: expect.any(String),
      },
    ]);
  });
});

describe('E009 product events: rejected events', () => {
  // Each call is a compile-time error (the @ts-expect-error fails typecheck when it isn't) and
  // is rejected at runtime. Outside production, `track()` throws, so a test sees it at once.
  type Track = ProductEvents<CatalogEvent<typeof CATALOG>>['track'];
  const invalid: Record<string, (track: Track) => void> = {
    'an unknown event': (track) =>
      track({
        // @ts-expect-error not in the catalog
        event: 'client_created',
        distinctId: USER_ID,
        properties: PROPERTIES,
      }),
    'an extra property': (track) =>
      track({
        event: 'booking_confirmed',
        distinctId: USER_ID,
        properties: {
          ...PROPERTIES,
          // @ts-expect-error client_name is not a property of booking_confirmed
          client_name: CLIENT_NAME,
        },
      }),
    'a free-text value': (track) =>
      track({
        event: 'booking_confirmed',
        distinctId: USER_ID,
        properties: {
          ...PROPERTIES,
          // @ts-expect-error channel is an enum, not free text
          channel: NOTE,
        },
      }),
    'an email address as distinct ID': (track) =>
      track({
        event: 'booking_confirmed',
        distinctId: EMAIL,
        properties: { ...PROPERTIES, booking_id: EMAIL },
      }),
  };

  it.each(Object.entries(invalid))('AC7: rejects %s outside production', async (_, send) => {
    for (const env of [
      { POSTHOG_KEY: 'phc_test' },
      { ...WITH_KEY, RAILWAY_ENVIRONMENT_NAME: 'pr-46' },
    ]) {
      const { transport, sentry, errorReporter, productEvents } = setup(env);

      expect(() => send(productEvents.track)).toThrow(ProductEventError);
      await productEvents.flush();
      await errorReporter.flush();

      expect(transport.events).toEqual([]);
      expect(sentry.events).toEqual([]);
    }
  });

  it('AC7: in production, drops a rejected event, reports it to Sentry as a warning and never throws', async () => {
    const { transport, sentry, errorReporter, productEvents } = setup();

    for (const send of Object.values(invalid)) {
      expect(() => send(productEvents.track)).not.toThrow();
    }
    // biome-ignore lint/suspicious/noExplicitAny: not an event at all
    expect(() => productEvents.track(null as any)).not.toThrow();
    await productEvents.flush();
    await errorReporter.flush();

    expect(transport.events).toEqual([]);
    expect(
      sentry.events.map((event) => [event.level, event.exception?.values?.[0]?.value]),
    ).toEqual([
      ['warning', 'Product event "client_created" rejected: event (not_in_catalog)'],
      [
        'warning',
        'Product event "booking_confirmed" rejected: properties.client_name (unrecognized_key)',
      ],
      ['warning', 'Product event "booking_confirmed" rejected: properties.channel (invalid_value)'],
      ['warning', 'Product event "booking_confirmed" rejected: distinctId (invalid_format)'],
      ['warning', 'Product event "?" rejected: event (invalid_type)'],
    ]);
    // Names what was wrong, never the values: they may be the personal data to keep out.
    const reported = JSON.stringify(sentry.events);
    for (const value of [CLIENT_NAME, EMAIL, NOTE]) expect(reported).not.toContain(value);
  });

  it('AC7: a property schema must be one of the allowed types, and names snake_case', () => {
    expect(() =>
      // @ts-expect-error free strings are not allowed
      defineCatalog({ note_added: { text: z.string() } }),
    ).toThrow('Property "text" of product event "note_added" must be made with `property`.');
    expect(() => defineCatalog({ BookingConfirmed: {} })).toThrow(
      'Product event "BookingConfirmed" must be snake_case.',
    );
    expect(() => defineCatalog({ booking_confirmed: { bookingId: property.uuid() } })).toThrow(
      'Property "bookingId" of product event "booking_confirmed" must be snake_case.',
    );
  });
});

describe('E009 product events: delivery', () => {
  it('AC5: without POSTHOG_KEY, track() makes no network call', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);
    const request = vi.spyOn(http, 'request');
    const secureRequest = vi.spyOn(https, 'request');

    for (const env of [PRODUCTION, { ...PRODUCTION, POSTHOG_KEY: '  ' }]) {
      const productEvents = createTracker(CATALOG, {
        env,
        errorReporter: createErrorReporter({ env: {} }),
      });
      productEvents.track({
        event: 'booking_confirmed',
        distinctId: USER_ID,
        properties: PROPERTIES,
      });
      await productEvents.flush();
      expect(productEvents.enabled).toBe(false);
    }

    expect(fetch).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(secureRequest).not.toHaveBeenCalled();
  });

  it('never throws when PostHog rejects a batch', async () => {
    // Fake timers: the flush must settle on the failure itself, not on its 1 s timeout.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const send = vi.fn<ProductEventTransport['send']>().mockResolvedValue({ statusCode: 400 });
    const { productEvents } = setup(WITH_KEY, { send });

    productEvents.track({
      event: 'booking_confirmed',
      distinctId: USER_ID,
      properties: PROPERTIES,
    });

    await expect(productEvents.flush()).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledOnce();
  });

  it('waits at most 1 s for a slow PostHog', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { productEvents } = setup(WITH_KEY, { send: () => new Promise(() => {}) });
    productEvents.track({
      event: 'booking_confirmed',
      distinctId: USER_ID,
      properties: PROPERTIES,
    });

    const flushed = vi.fn();
    const flush = productEvents.flush().then(flushed);
    await vi.advanceTimersByTimeAsync(999);
    expect(flushed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await flush;
    expect(flushed).toHaveBeenCalled();
  });

  it('gives each anonymous visitor a random distinct ID', () => {
    const first = anonymousDistinctId();
    expect(z.uuid().safeParse(first).success).toBe(true);
    expect(anonymousDistinctId()).not.toBe(first);
  });
});
