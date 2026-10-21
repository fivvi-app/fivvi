import { messages } from '@trainer-hub/i18n';
import { describe, expect, it } from 'vitest';
import { createMemoryTransport } from './memory.ts';
import { createSendEmail } from './send.ts';
import { helloEmail } from './templates/hello.tsx';
import { EmailSendError } from './transport.ts';

const sender = { email: 'noreply@fivvi.app', name: 'Fivvi' };
const props = { firstName: 'Anna', sentAt: new Date('2026-09-22T16:00:00Z') };

function setup() {
  const transport = createMemoryTransport();
  let key = 0;
  const sendEmail = createSendEmail({
    transport,
    sender,
    sleep: () => Promise.resolve(),
    random: () => 0,
    idempotencyKey: () => `key-${++key}`,
  });
  return { transport, sendEmail };
}

describe('E006 sendEmail', () => {
  it('renders in the recipient locale and hands the email to the transport', async () => {
    const { transport, sendEmail } = setup();

    const result = await sendEmail({
      template: helloEmail,
      props,
      to: { email: 'anna@example.com' },
      locale: 'en',
    });

    expect(result).toEqual({ messageId: 'memory-1', attempts: 1 });
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      from: sender,
      to: { email: 'anna@example.com' },
      locale: 'en',
      template: 'hello',
      subject: messages.en.email.hello.subject,
      idempotencyKey: 'key-1',
      links: [],
    });
  });

  it('gives every send its own idempotency key', async () => {
    const { transport, sendEmail } = setup();
    const send = () =>
      sendEmail({ template: helloEmail, props, to: { email: 'a@example.com' }, locale: 'nl-NL' });

    await send();
    await send();

    expect(transport.sent.map((e) => e.idempotencyKey)).toEqual(['key-1', 'key-2']);
  });

  it('retries a retryable failure and gives up on the others', async () => {
    const { transport, sendEmail } = setup();
    const send = () =>
      sendEmail({ template: helloEmail, props, to: { email: 'a@example.com' }, locale: 'nl-NL' });

    transport.failNext(new EmailSendError('memory: down', { retryable: true }));
    expect((await send()).attempts).toBe(2);

    transport.failNext(new EmailSendError('memory: rejected', { retryable: false }));
    await expect(send()).rejects.toMatchObject({ message: 'memory: rejected', attempts: 1 });

    // An unexpected error from a transport is not retried either.
    transport.failNext(new Error('bug'));
    await expect(send()).rejects.toMatchObject({ retryable: false, attempts: 1 });
    expect(transport.sent).toHaveLength(1);
  });

  it('does not send when the template fails to render', async () => {
    const { transport, sendEmail } = setup();
    const broken = { ...helloEmail, subject: () => 'x', render: () => ({}) as never };

    await expect(
      sendEmail({ template: broken, props, to: { email: 'a@example.com' }, locale: 'nl-NL' }),
    ).rejects.toThrow();
    expect(transport.sent).toEqual([]);
  });
});

describe('E006 memory transport', () => {
  it('records the links in the HTML, e.g. for a sign-in link', async () => {
    const transport = createMemoryTransport();
    await transport.send({
      from: sender,
      to: { email: 'a@example.com' },
      subject: 's',
      html: '<a href="https://example.com/login?token=abc&amp;next=%2F">x</a> <a href="/b">y</a>',
      text: 't',
      locale: 'nl-NL',
      template: 'test',
      idempotencyKey: 'k',
    });
    expect(transport.sent[0]?.links).toEqual([
      'https://example.com/login?token=abc&next=%2F',
      '/b',
    ]);

    transport.clear();
    expect(transport.sent).toEqual([]);
  });
});
