import type { EmailTransport } from './transport.ts';

/**
 * Writes an email to the server log instead of sending it: the whole text version, so the
 * code and link of a sign-in email can be read from the log of a preview or a local server
 * (F001 AC15). The link is printed as it is, with its `returnTo` page (#207) next to its token:
 * the one known place that logs it. Only ever used outside production, for `@example.com` addresses
 * (`createEnvironmentSendEmail`).
 */
export function createLogTransport(log: (line: string) => void = console.info): EmailTransport {
  return {
    name: 'log',
    send(email) {
      log(
        [
          `[email] not sent, logged instead (${email.template})`,
          `To: ${email.to.email}`,
          `Subject: ${email.subject}`,
          '',
          email.text,
        ].join('\n'),
      );
      return Promise.resolve({ messageId: `log-${email.idempotencyKey}` });
    },
  };
}
