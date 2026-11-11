import { resolveInternalCommunicationLanguage } from '@fivvi/i18n';
import type { DemoRequestMail } from './demo-request-mail.ts';
import type { SendEmail } from './send.ts';
import { demoRequestEmail } from './templates/demo-request.tsx';
import type { EmailAddress } from './transport.ts';

export interface DemoRequestSenderOptions {
  sendEmail: SendEmail;
  /** Where demo requests go: Fivvi's own support address, never the visitor's. */
  to: EmailAddress;
}

/**
 * The function `packages/api` calls to email a demo request (F064): renders the template in the
 * owner's language (Dutch, whatever language the visitor used) and sends it to `to` alone. The API
 * package cannot import the templates itself (they are `.tsx`, which the contract script's Node
 * cannot load), so `apps/web` wires this in.
 */
export function createDemoRequestSender({
  sendEmail,
  to,
}: DemoRequestSenderOptions): (mail: DemoRequestMail) => Promise<void> {
  return async (mail) => {
    await sendEmail({
      template: demoRequestEmail,
      props: mail,
      to,
      locale: resolveInternalCommunicationLanguage(),
    });
  };
}
