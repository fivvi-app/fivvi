/** A serialized Sentry envelope on its way to the ingest endpoint. */
export interface EnvelopeRequest {
  /** The DSN's envelope endpoint, with the public key. */
  url: string;
  body: string | Uint8Array;
}

export interface EnvelopeResponse {
  statusCode: number;
  /** Sentry's rate limit headers, so the SDK backs off when the quota runs out (R14). */
  headers?: { 'x-sentry-rate-limits': string | null; 'retry-after': string | null };
}

/** Hands an envelope to Sentry. The real one posts it; tests use `createCaptureTransport()`. */
export interface ErrorTransport {
  send(request: EnvelopeRequest): Promise<EnvelopeResponse>;
}

/** Posts envelopes with `fetch`. Only used when a DSN is configured. */
export function createFetchTransport(): ErrorTransport {
  return {
    send: async ({ url, body }) => {
      // A copy, typed as backed by an ArrayBuffer, which the DOM's `BodyInit` requires.
      const payload = typeof body === 'string' ? body : new Uint8Array(body);
      const response = await fetch(url, { method: 'POST', body: payload });
      return {
        statusCode: response.status,
        headers: {
          'x-sentry-rate-limits': response.headers.get('x-sentry-rate-limits'),
          'retry-after': response.headers.get('retry-after'),
        },
      };
    },
  };
}
