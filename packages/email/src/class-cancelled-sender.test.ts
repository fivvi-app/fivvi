import { describe, expect, it } from 'vitest';
import type { ClassCancelledMail } from './class-cancelled-mail.ts';
import { createClassCancelledSender } from './class-cancelled-sender.ts';
import { emailIdempotencyKey } from './idempotency-key.ts';
import { createMemoryTransport } from './memory.ts';
import { createSendEmail } from './send.ts';
import { dutch, english } from './test-languages.ts';

// F026 (spec #462, ticket #558): the sender of the class variant of EM-05. Synthetic: John's Gym,
// Anna (Dutch) and Mark (English), Kracht on Tuesday 20 October 2026 at 18:00 in Amsterdam.

const anna: ClassCancelledMail = {
  to: { email: 'anna@example.com', name: 'Anna de Vries' },
  locale: dutch,
  workspaceName: "John's Gym",
  timeZone: 'Europe/Amsterdam',
  class: { nameNl: 'Kracht', nameEn: 'Strength' },
  startsAt: new Date('2026-10-20T16:00:00Z'),
  endsAt: new Date('2026-10-20T17:00:00Z'),
  location: {
    name: "John's Gym",
    address: {
      street: 'Voorbeeldstraat',
      houseNumber: '1',
      houseNumberAddition: 'B',
      postcode: '1234 AB',
      city: 'Amsterdam',
    },
  },
  message: 'Sarah is ziek, sorry!',
  event: 'date-1:2:anna',
};

function setup() {
  const transport = createMemoryTransport();
  const sendEmail = createSendEmail({
    transport,
    sender: { email: 'noreply@fivvi.example.test', name: 'Fivvi' },
    replyTo: { email: 'support@example.com' },
  });
  return { transport, send: createClassCancelledSender({ sendEmail }) };
}

describe('F026 EM-05 class sender', () => {
  it('AC6: sends EM-05 in the recipient’s language with the idempotency key of EM-05 and the event', async () => {
    const { transport, send } = setup();

    await send(anna);

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      to: { email: 'anna@example.com', name: 'Anna de Vries' },
      locale: 'nl-NL',
      template: 'cancellation',
      subject: 'Kracht op dinsdag 20 oktober gaat niet door',
      idempotencyKey: emailIdempotencyKey('EM-05', anna.event),
    });
    expect(transport.sent[0]?.text).toContain('Bericht van John');
    expect(transport.sent[0]?.text).toContain('Sarah is ziek, sorry!');
    expect(transport.sent[0]?.text).toContain(
      "Waar: John's Gym, Voorbeeldstraat 1 B, 1234 AB Amsterdam",
    );
  });

  it('AC6: sends it in English, with the English class name, when the mail says English', async () => {
    const { transport, send } = setup();

    await send({
      ...anna,
      locale: english,
      to: { email: 'mark@example.com', name: 'Mark Jansen' },
    });

    expect(transport.sent[0]).toMatchObject({
      locale: 'en',
      subject: 'Strength on Tuesday 20 October is cancelled',
    });
    expect(transport.sent[0]?.text).toContain("Message from John's Gym:");
    expect(transport.sent[0]?.text).toContain('Sarah is ziek, sorry!');
  });

  it('leaves the message and the address out when there are none', async () => {
    const { transport, send } = setup();

    await send({ ...anna, message: null, location: { name: "John's Gym", address: null } });

    expect(transport.sent[0]?.text).not.toContain('Bericht van');
    expect(transport.sent[0]?.text).toContain("Waar: John's Gym");
    expect(transport.sent[0]?.text).not.toContain('Voorbeeldstraat');
  });

  it('AC12: the same event reaches the provider with the same key, another participant with another', async () => {
    const { transport, send } = setup();

    await send(anna);
    await send(anna);
    await send({ ...anna, event: 'date-1:2:mark' });

    const keys = transport.sent.map((email) => email.idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });
});
