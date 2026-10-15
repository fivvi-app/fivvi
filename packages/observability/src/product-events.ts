import { randomUUID } from 'node:crypto';
import { PostHog } from 'posthog-node';
import { z } from 'zod';
import { PRODUCT_EVENT_CATALOG } from './catalog.ts';
import { type EnvironmentVariables, POSTHOG_EU_HOST, readErrorReportingConfig } from './config.ts';
import type { CatalogEvent, EventCatalog } from './event-schema.ts';
import type { ErrorReporter } from './reporter.ts';

/** How long `flush()` waits, so a slow PostHog holds up a response for at most this long. */
const FLUSH_TIMEOUT_MS = 1_000;

/** A batch of product events on its way to PostHog. */
export interface ProductEventRequest {
  url: string;
  headers: Readonly<Record<string, string>>;
  /** JSON, gzipped when the SDK compresses it (`Content-Encoding: gzip`). */
  body: string | Uint8Array;
}

/** Hands a batch to PostHog. Production uses `fetch`; tests use the capture transport. */
export interface ProductEventTransport {
  send(request: ProductEventRequest): Promise<{ statusCode: number }>;
}

/** An event from the catalog (`catalog.ts`). */
export type ProductEvent = CatalogEvent<typeof PRODUCT_EVENT_CATALOG>;

export interface ProductEvents<Event = ProductEvent> {
  /** False without `POSTHOG_KEY`: then events are still checked, but nothing is sent. */
  readonly enabled: boolean;
  /**
   * Sends a catalog event. An event that doesn't match the catalog is rejected: outside
   * production it throws a `ProductEventError`, so a test or a developer sees it at once; in
   * production it is dropped and reported to Sentry as a warning, and `track()` never throws.
   */
  track(event: Event): void;
  /** Sends what `track()` queued; call it once per request. Never throws, waits at most 1 s. */
  flush(): Promise<void>;
}

export interface ProductEventsOptions {
  /** Where a rejected event is reported in production. */
  errorReporter: ErrorReporter;
  /** Defaults to `process.env` (`POSTHOG_KEY`, `RAILWAY_ENVIRONMENT_NAME`). */
  env?: EnvironmentVariables;
  /** Tests pass `createProductEventCaptureTransport()`; production posts with `fetch`. */
  transport?: ProductEventTransport;
}

/** An event that isn't in the catalog or doesn't match its schema. Names what, never values. */
export class ProductEventError extends Error {
  override name = 'ProductEventError';
}

/** Product events to PostHog EU from server code (E009, OBSERVABILITY.md §4). */
export function createProductEvents(options: ProductEventsOptions): ProductEvents {
  return createTracker(PRODUCT_EVENT_CATALOG, options);
}

/** The `distinctId` for an anonymous visitor: random for each request, never stored. */
export function anonymousDistinctId(): string {
  return randomUUID();
}

/** `createProductEvents()` for any catalog, so tests can use their own. */
export function createTracker<Catalog extends EventCatalog>(
  catalog: Catalog,
  options: ProductEventsOptions,
): ProductEvents<CatalogEvent<Catalog>> {
  const env = options.env ?? process.env;
  const production = readErrorReportingConfig(env).environment === 'production';
  const key = env.POSTHOG_KEY?.trim() || undefined;
  const schemas = new Map(
    Object.entries(catalog).map(([event, properties]) => [event, z.strictObject(properties)]),
  );
  const client = key && createClient(key, options.transport);

  return {
    enabled: Boolean(client),
    track: (event) => {
      const result = validate(schemas, event);
      if (!result.success) {
        if (!production) throw result.error;
        options.errorReporter.captureError(result.error, { level: 'warning' });
        return;
      }
      if (client) client.capture(result.event);
    },
    flush: async () => {
      if (!client) return;
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, FLUSH_TIMEOUT_MS);
      });
      // A failed send is PostHog's to log; it must never fail the request.
      await Promise.race([client.flush().catch(() => {}), timeout]);
      clearTimeout(timer);
    },
  };
}

function createClient(key: string, transport: ProductEventTransport | undefined): PostHog {
  return new PostHog(key, {
    host: POSTHOG_EU_HOST,
    // Send each event straight away; `flush()` then waits for what is still on its way.
    flushAt: 1,
    flushInterval: 0,
    disableGeoip: true,
    enableExceptionAutocapture: false,
    ...(transport && {
      fetch: async (url, { headers, body }) => {
        const { statusCode } = await transport.send({ url, headers, body: await toBody(body) });
        return { status: statusCode, text: async () => '', json: async () => ({}) };
      },
    }),
  });
}

async function toBody(body: string | Blob | Uint8Array | undefined): Promise<string | Uint8Array> {
  if (body === undefined) return '';
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  return body;
}

const ENVELOPE = z.strictObject({
  event: z.string(),
  distinctId: z.uuid(),
  properties: z.unknown(),
});

type Validation =
  | {
      success: true;
      event: { event: string; distinctId: string; properties: Record<string, unknown> };
    }
  | { success: false; error: ProductEventError };

function validate(schemas: ReadonlyMap<string, z.ZodObject>, input: unknown): Validation {
  const envelope = ENVELOPE.safeParse(input);
  if (!envelope.success) return rejected(input, describe(envelope.error.issues));
  const { event, distinctId } = envelope.data;
  const schema = schemas.get(event);
  if (!schema) return rejected(input, ['event (not_in_catalog)']);
  const properties = schema.safeParse(envelope.data.properties);
  if (!properties.success)
    return rejected(input, describe(properties.error.issues, ['properties']));
  return { success: true, event: { event, distinctId, properties: properties.data } };
}

/** Names and codes from code only: a rejected value may be exactly the personal data to keep out. */
const SAFE_NAME = /^[A-Za-z0-9_$]{1,64}$/;

function rejected(input: unknown, problems: string[]): Validation {
  const event = (input as { event?: unknown } | null)?.event;
  const name = typeof event === 'string' && SAFE_NAME.test(event) ? event : '?';
  const message = `Product event "${name}" rejected: ${problems.join(', ')}`;
  return { success: false, error: new ProductEventError(message) };
}

function describe(issues: z.core.$ZodIssue[], prefix: PropertyKey[] = []): string[] {
  return issues.flatMap((issue) => {
    const path = [...prefix, ...issue.path];
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => `${formatPath([...path, key])} (unrecognized_key)`);
    }
    return [`${formatPath(path)} (${issue.code})`];
  });
}

function formatPath(path: PropertyKey[]): string {
  if (path.length === 0) return 'event';
  return path
    .map((part) => (typeof part === 'string' && SAFE_NAME.test(part) ? part : '?'))
    .join('.');
}
