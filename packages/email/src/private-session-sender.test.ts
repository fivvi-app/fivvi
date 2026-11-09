import { describe, expect, it } from 'vitest';
import { createMemoryTransport } from './memory.ts';
import { createPrivateSessionSender } from './private-session-sender.ts';
import { createSendEmail } from './send.ts';

const mail = {
  to: { email: 'anna@example.com', name: 'Anna de Vries' },
  locale: 'nl-NL' as const,
  workspaceName: "John's Gym",
  timeZone: 'Europe/Amsterdam',
  // Thursday 24 September 2026, 09:00 to 10:00 in Amsterdam.
  startsAt: new Date('2026-09-24T07:00:00Z'),
  endsAt: new Date('2026-09-24T08:00:00Z'),
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
  trainerName: 'Sarah',
  idempotencyKey: '9d3c1e52-7c1a-5b8e-9f10-4a2b6c8d0e13',
};

function setup() {
  const transport = createMemoryTransport();
  const sendEmail = createSendEmail({
    transport,
    sender: { email: 'noreply@fivvi.example.test', name: 'Fivvi' },
  });
  return { transport, send: createPrivateSessionSender({ sendEmail }) };
}

describe('F020 EM-11 sender', () => {
  it('AC1: sends EM-11 to the client in the given language, with the idempotency key', async () => {
    const { transport, send } = setup();

    await send(mail);

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      to: { email: 'anna@example.com', name: 'Anna de Vries' },
      locale: 'nl-NL',
      template: 'private-session',
      subject: 'Nieuwe afspraak: donderdag 24 september om 09:00',
      idempotencyKey: mail.idempotencyKey,
    });
  });

  it('AC3: sends it in English when the mail says English', async () => {
    const { transport, send } = setup();

    await send({ ...mail, locale: 'en' });

    expect(transport.sent[0]).toMatchObject({
      locale: 'en',
      subject: 'New appointment: Thursday 24 September at 09:00',
    });
  });

  it('writes the address the Dutch way: street, number with its addition, postcode and city', async () => {
    const { transport, send } = setup();

    await send(mail);
    await send({
      ...mail,
      location: {
        ...mail.location,
        address: { ...mail.location.address, houseNumberAddition: null },
      },
    });

    expect(transport.sent[0]?.text).toContain(
      "Waar: John's Gym, Voorbeeldstraat 1 B, 1234 AB Amsterdam",
    );
    expect(transport.sent[1]?.text).toContain(
      "Waar: John's Gym, Voorbeeldstraat 1, 1234 AB Amsterdam",
    );
  });

  it('leaves the address out for a location without one', async () => {
    const { transport, send } = setup();

    await send({ ...mail, location: { name: "John's Gym", address: null } });

    expect(transport.sent[0]?.text).toContain("Waar: John's Gym");
    expect(transport.sent[0]?.text).not.toContain('Voorbeeldstraat');
  });
});
