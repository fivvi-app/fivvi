import { catalog, internalCatalog } from '@fivvi/email';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { describe, expect, it } from 'vitest';
import { recordEmailSent } from './email-sent';

function capture() {
  const posthog = createProductEventCaptureTransport();
  const productEvents = createProductEvents({
    errorReporter: createErrorReporter(),
    env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
    transport: posthog,
  });
  return { posthog, productEvents };
}

// Every email that can be sent: the catalog's active entries and the internal ones.
const sendable = [
  ...catalog.flatMap((entry) => (entry.status === 'active' ? [entry.id] : [])),
  ...internalCatalog.map((entry) => entry.key),
];

describe('F049 AC11: the email_sent product event', () => {
  it('carries the catalog ID and the language, and nothing else', async () => {
    const { posthog, productEvents } = capture();
    const record = recordEmailSent(productEvents);

    record({ emailId: 'EM-11', language: 'nl-NL' });
    record({ emailId: 'EM-08', language: 'en' });
    await productEvents.flush();

    expect(posthog.events.map(({ event }) => event)).toEqual(['email_sent', 'email_sent']);
    const properties = posthog.events.map((event) =>
      Object.fromEntries(Object.entries(event.properties).filter(([key]) => !key.startsWith('$'))),
    );
    expect(properties).toEqual([
      { email_id: 'EM-11', language: 'nl-NL' },
      { email_id: 'EM-08', language: 'en' },
    ]);
  });

  it('is not tied to the recipient: a random ID for each event', async () => {
    const { posthog, productEvents } = capture();
    const record = recordEmailSent(productEvents);

    record({ emailId: 'EM-11', language: 'nl-NL' });
    record({ emailId: 'EM-11', language: 'nl-NL' });
    await productEvents.flush();

    const [first, second] = posthog.events.map((event) => event.distinct_id);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).not.toBe(first);
  });

  it.each(sendable)(
    'accepts %s, so no email that can be sent is missing from the event',
    async (emailId) => {
      const { posthog, productEvents } = capture();

      recordEmailSent(productEvents)({ emailId, language: 'en' });
      await productEvents.flush();

      expect(posthog.events).toHaveLength(1);
    },
  );
});
