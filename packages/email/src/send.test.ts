import { messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { emailIdempotencyKey } from './idempotency-key.ts';
import { createMemoryTransport } from './memory.ts';
import { createSendEmail, type SentEvent } from './send.ts';
import { helloEmail } from './templates/hello.tsx';
import { privateSessionEmail } from './templates/private-session.tsx';
import { privateSessionMovedEmail } from './templates/private-session-moved.tsx';
import { signInEmail } from './templates/sign-in.tsx';
import { dutch, english } from './test-languages.ts';
import { EmailSendError, type OutgoingEmail } from './transport.ts';

const sender = { email: 'noreply@fivvi.app', name: 'Fivvi' };
const props = { firstName: 'Anna', sentAt: new Date('2026-09-22T16:00:00Z') };
const to = { email: 'anna@example.com' };

function setup(onSent?: (event: SentEvent) => void) {
  const transport = createMemoryTransport();
  const sendEmail = createSendEmail({
    transport,
    sender,
    sleep: () => Promise.resolve(),
    random: () => 0,
    onSent,
  });
  return { transport, sendEmail };
}

describe('E006 sendEmail', () => {
  it('renders in the recipient locale and hands the email to the transport', async () => {
    const { transport, sendEmail } = setup();

    const result = await sendEmail({
      template: helloEmail,
      props,
      to,
      locale: english,
      event: 'hello-1',
    });

    expect(result).toEqual({ messageId: 'memory-1', attempts: 1 });
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      from: sender,
      to,
      locale: 'en',
      template: 'hello',
      subject: messages.en.email.hello.subject,
      idempotencyKey: emailIdempotencyKey('hello', 'hello-1'),
      links: [],
    });
  });

  it('retries a retryable failure and gives up on the others', async () => {
    const { transport, sendEmail } = setup();
    const send = () => sendEmail({ template: helloEmail, props, to, locale: dutch, event: 'e' });

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
      sendEmail({ template: broken, props, to, locale: dutch, event: 'e' }),
    ).rejects.toThrow();
    expect(transport.sent).toEqual([]);
  });
});

describe('F049 AC11: every send carries its catalog ID', () => {
  it('AC11: the same email for the same event twice reaches the provider with the same key', async () => {
    const { transport, sendEmail } = setup();
    const send = () =>
      sendEmail({
        template: privateSessionEmail,
        props: privateSessionEmail.previewProps,
        to,
        locale: dutch,
        event: 'session-1:1',
      });

    await send();
    await send();

    // EM-11, the confirmation of a private session, for the session at its first version.
    const key = emailIdempotencyKey('EM-11', 'session-1:1');
    expect(transport.sent.map((email) => email.idempotencyKey)).toEqual([key, key]);
  });

  it('AC11: the key is built from the catalog ID and the event, so either one changes it', async () => {
    const { transport, sendEmail } = setup();
    const delivery = { to, locale: dutch };
    const moved = privateSessionMovedEmail;

    await sendEmail({
      template: privateSessionEmail,
      props: privateSessionEmail.previewProps,
      event: 'session-1:1',
      ...delivery,
    });
    await sendEmail({
      template: privateSessionEmail,
      props: privateSessionEmail.previewProps,
      event: 'session-1:2',
      ...delivery,
    });
    await sendEmail({
      template: moved,
      props: moved.previewProps,
      event: 'session-1:1',
      ...delivery,
    });

    const keys = transport.sent.map((email) => email.idempotencyKey);
    expect(keys).toEqual([
      emailIdempotencyKey('EM-11', 'session-1:1'),
      emailIdempotencyKey('EM-11', 'session-1:2'),
      emailIdempotencyKey('EM-04', 'session-1:1'),
    ]);
    expect(new Set(keys).size).toBe(3);
  });

  it('AC11: the key stays the same on every attempt of one send', async () => {
    const attempted: string[] = [];
    const inner = createMemoryTransport();
    const transport = {
      name: 'recording',
      send: (email: OutgoingEmail) => {
        attempted.push(email.idempotencyKey);
        return attempted.length === 1
          ? Promise.reject(new EmailSendError('down', { retryable: true }))
          : inner.send(email);
      },
    };
    const sendEmail = createSendEmail({
      transport,
      sender,
      sleep: () => Promise.resolve(),
      random: () => 0,
    });

    await sendEmail({ template: helloEmail, props, to, locale: dutch, event: 'invitation-1' });

    const key = emailIdempotencyKey('hello', 'invitation-1');
    expect(attempted).toEqual([key, key]);
  });

  it('refuses a template that is not in the catalog, and sends nothing', async () => {
    const { transport, sendEmail } = setup();
    const stranger = { ...helloEmail, id: 'not-in-the-catalog' };

    await expect(
      sendEmail({ template: stranger, props, to, locale: dutch, event: 'e' }),
    ).rejects.toThrow(/not in the email catalog/);
    expect(transport.sent).toEqual([]);
  });

  it('records the catalog ID and the language of a successful send, and nothing else', async () => {
    const sent: SentEvent[] = [];
    const { sendEmail } = setup((event) => sent.push(event));

    await sendEmail({
      template: signInEmail,
      props: signInEmail.previewProps,
      to,
      locale: english,
      event: 'sign-in-1',
    });

    // EM-08, the sign-in email, in English: no address, name or code.
    expect(sent).toEqual([{ emailId: 'EM-08', language: 'en' }]);
  });

  it('records nothing for a send that failed', async () => {
    const sent: SentEvent[] = [];
    const { transport, sendEmail } = setup((event) => sent.push(event));

    transport.failNext(new EmailSendError('memory: rejected', { retryable: false }));
    await expect(
      sendEmail({ template: helloEmail, props, to, locale: dutch, event: 'e' }),
    ).rejects.toThrow();

    expect(sent).toEqual([]);
  });

  it('records the send once, however many attempts it took', async () => {
    const sent: SentEvent[] = [];
    const { transport, sendEmail } = setup((event) => sent.push(event));

    transport.failNext(new EmailSendError('memory: down', { retryable: true }));
    await sendEmail({ template: helloEmail, props, to, locale: dutch, event: 'e' });

    expect(sent).toEqual([{ emailId: 'hello', language: 'nl-NL' }]);
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
      locale: dutch,
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
