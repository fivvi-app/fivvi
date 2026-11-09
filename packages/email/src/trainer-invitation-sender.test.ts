import { describe, expect, it } from 'vitest';
import { createMemoryTransport } from './memory.ts';
import { createSendEmail } from './send.ts';
import { createTrainerInvitationSender } from './trainer-invitation-sender.ts';

const mail = {
  to: { email: 'lisa@example.com', name: 'Lisa' },
  locale: 'en' as const,
  inviterName: 'John',
  workspaceName: "John's Gym",
  timeZone: 'Europe/Amsterdam',
  token: 'token-for-a-test-not-real',
  expiresAt: new Date('2026-11-12T10:00:00Z'),
  idempotencyKey: '3b8f1c5e-0c1f-5a0e-8c3b-2f6d9a7e4b10',
};

function setup(appBaseUrl: () => string) {
  const transport = createMemoryTransport();
  const sendEmail = createSendEmail({
    transport,
    sender: { email: 'noreply@fivvi.example.test', name: 'Fivvi' },
  });
  return { transport, send: createTrainerInvitationSender({ sendEmail, appBaseUrl }) };
}

describe('F011 EM-09 sender', () => {
  it('AC1: sends EM-09 to the invited person in the given language, with the idempotency key', async () => {
    const { transport, send } = setup(() => 'https://fivvi.example.test');

    await send(mail);

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      to: { email: 'lisa@example.com', name: 'Lisa' },
      locale: 'en',
      template: 'trainer-invitation',
      subject: "John invited you to John's Gym",
      idempotencyKey: mail.idempotencyKey,
    });
    expect(transport.sent[0]?.text).toContain('valid until Thursday, 12 November 2026');
  });

  it('AC1: the link is the invitation page of the app with the token', async () => {
    const { transport, send } = setup(() => 'https://fivvi.example.test/');

    await send(mail);

    // A trailing slash on the address does not double up.
    expect(transport.sent[0]?.links).toContain(
      'https://fivvi.example.test/invitations/token-for-a-test-not-real',
    );
  });

  it('reads the address of the app when it sends, not when it is made', async () => {
    let address = 'https://one.example.test';
    const { transport, send } = setup(() => address);
    address = 'https://two.example.test';

    await send(mail);

    expect(transport.sent[0]?.links).toContain(
      'https://two.example.test/invitations/token-for-a-test-not-real',
    );
  });

  it('shows the expiry date in the time zone it is given', async () => {
    const { transport, send } = setup(() => 'https://fivvi.example.test');

    await send({ ...mail, expiresAt: new Date('2026-11-12T23:30:00Z') });

    expect(transport.sent[0]?.text).toContain('valid until Friday, 13 November 2026');
  });
});
