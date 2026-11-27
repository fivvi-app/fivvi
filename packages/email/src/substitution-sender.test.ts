import { describe, expect, it } from 'vitest';
import { emailIdempotencyKey } from './idempotency-key.ts';
import { createMemoryTransport } from './memory.ts';
import { createSendEmail } from './send.ts';
import type { SubstitutionMail } from './substitution-mail.ts';
import { createSubstitutionSender } from './substitution-sender.ts';
import { dutch, english } from './test-languages.ts';

// F024 (spec #461, ticket #552): the sender of EM-10. Synthetic: John's Gym, Mike (English), Sarah,
// Kracht on Tuesday 20 October 2026 at 18:00 in Amsterdam.

const mike: SubstitutionMail = {
  to: { email: 'mike@example.com', name: 'Mike' },
  locale: english,
  workspaceName: "John's Gym",
  workspaceSlug: 'johns-gym',
  timeZone: 'Europe/Amsterdam',
  session: { id: '00000000-0000-4000-8000-000000000001', nameNl: 'Kracht', nameEn: null },
  startsAt: new Date('2026-10-20T16:00:00Z'),
  endsAt: new Date('2026-10-20T17:00:00Z'),
  location: {
    name: "John's Gym",
    address: {
      street: 'Voorbeeldstraat',
      houseNumber: '1',
      houseNumberAddition: null,
      postcode: '1234 AB',
      city: 'Amsterdam',
    },
  },
  originalName: 'Sarah',
  event: 'substitution:session-1:mike',
};

function setup() {
  const transport = createMemoryTransport();
  const sendEmail = createSendEmail({
    transport,
    sender: { email: 'noreply@fivvi.example.test', name: 'Fivvi' },
    replyTo: { email: 'support@example.com' },
  });
  return { transport, send: createSubstitutionSender({ sendEmail }) };
}

describe('F024 EM-10 sender', () => {
  it('AC2: sends Mike one English email with the idempotency key of EM-10 and the event', async () => {
    const { transport, send } = setup();

    await send(mike);

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      to: { email: 'mike@example.com' },
      locale: 'en',
      template: 'substitution',
      subject: "You're covering: Kracht on Tuesday 20 October",
      idempotencyKey: emailIdempotencyKey('EM-10', mike.event),
    });
    expect(transport.sent[0]?.text).toContain("You're covering for Sarah");
    expect(transport.sent[0]?.text).toContain("John's Gym, Voorbeeldstraat 1, 1234 AB Amsterdam");
  });

  it('AC2: writes it in Dutch for a Dutch substitute and the location without an address as its name', async () => {
    const { transport, send } = setup();

    await send({ ...mike, locale: dutch, location: { name: 'Park', address: null } });

    expect(transport.sent[0]).toMatchObject({
      locale: 'nl-NL',
      subject: 'Je valt in: Kracht op dinsdag 20 oktober',
    });
    expect(transport.sent[0]?.text).toContain('Waar: Park');
  });
});
