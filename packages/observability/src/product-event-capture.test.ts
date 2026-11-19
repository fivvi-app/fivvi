import { describe, expect, it, vi } from 'vitest';
import { createProductEventCaptureTransport, whatFivviSent } from './product-event-capture.ts';

const PINNED = '2026-10-13T18:00:30.000Z';

async function sendOne(properties: Record<string, unknown>) {
  const transport = createProductEventCaptureTransport();
  await transport.send({
    url: 'https://posthog.example.test/batch/',
    headers: {},
    body: JSON.stringify({
      batch: [
        {
          event: 'class_scheduled',
          distinct_id: 'user-1',
          properties,
          timestamp: PINNED,
          uuid: '019ab000-0000-7000-8000-181500000000',
        },
      ],
    }),
  });
  return transport.events;
}

describe('whatFivviSent (#1494)', () => {
  it('leaves out the timestamp and the uuid the PostHog client adds, so the wall clock never matches a value', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(PINNED));
    try {
      const events = await sendOne({ workspace_id: 'w-1', surface: 'web' });
      expect(JSON.stringify(events)).toContain('18:00');
      const sent = JSON.stringify(whatFivviSent(events));
      for (const clockValue of ['18:00', '2026-10-13']) expect(sent).not.toContain(clockValue);
      expect(whatFivviSent(events)).toEqual([
        {
          event: 'class_scheduled',
          distinct_id: 'user-1',
          properties: { workspace_id: 'w-1', surface: 'web' },
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still shows a personal value in an event name, distinct id or property, so the check is not weakened', async () => {
    const events = await sendOne({ workspace_id: 'w-1', starts_at: '19:15', note: 'Geheime les' });
    const sent = JSON.stringify(whatFivviSent(events));
    expect(sent).toContain('19:15');
    expect(sent).toContain('Geheime les');
    expect(sent).toContain('user-1');
    expect(sent).toContain('class_scheduled');
  });
});
