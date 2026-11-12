import { describe, expect, it } from 'vitest';
import type { DemoRequestMail } from './demo-request-mail.ts';
import { createDemoRequestSender } from './demo-request-sender.ts';
import { createMemoryTransport } from './memory.ts';
import { createSendEmail } from './send.ts';

const mail: DemoRequestMail = {
  name: 'Anna de Vries',
  email: 'anna@example.com',
  businessKind: 'gym',
  trainerCount: 'five-or-more',
  message: null,
  locale: 'en',
};

function setup() {
  const transport = createMemoryTransport();
  const sendEmail = createSendEmail({
    transport,
    sender: { email: 'noreply@fivvi.example.test', name: 'Fivvi' },
  });
  const send = createDemoRequestSender({
    sendEmail,
    to: { email: 'support@fivvi.example.test', name: 'Fivvi support' },
  });
  return { transport, send };
}

describe('F064 AC5 the demo request sender', () => {
  it('sends one email, to the address it is given only, in Dutch whatever the visitor’s language', async () => {
    const { transport, send } = setup();

    await send(mail);

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      to: { email: 'support@fivvi.example.test' },
      locale: 'nl-NL',
      template: 'demo-request',
      subject: 'Demo-aanvraag: Anna de Vries',
    });
  });

  it('sends a double submit once: the same answers reach the provider with one idempotency key', async () => {
    const { transport, send } = setup();

    await send(mail);
    await send({ ...mail });
    await send({ ...mail, message: 'A different request' });

    const [first, second, third] = transport.sent.map(({ idempotencyKey }) => idempotencyKey);
    expect(second).toBe(first);
    expect(third).not.toBe(first);
  });

  it('never writes to the visitor', async () => {
    const { transport, send } = setup();

    await send(mail);

    expect(transport.sent.map(({ to }) => to.email)).not.toContain('anna@example.com');
  });
});
