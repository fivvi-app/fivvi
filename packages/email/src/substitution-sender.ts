import type { PrivateSessionMailAddress } from './private-session-mail.ts';
import type { SendEmail } from './send.ts';
import type { SubstitutionMail } from './substitution-mail.ts';
import { substitutionEmail } from './templates/substitution.tsx';

export interface SubstitutionSenderOptions {
  sendEmail: SendEmail;
}

/** The Dutch way: street, number with its addition, then postcode and city. */
function addressLine(address: PrivateSessionMailAddress): string {
  return `${address.street} ${address.houseNumber}${address.houseNumberAddition ? ` ${address.houseNumberAddition}` : ''}, ${address.postcode} ${address.city}`;
}

/**
 * The function `packages/api` calls to email EM-10, the notice to a trainer who covers a class date
 * (F024): renders the template in the language it is given, in the workspace's time zone. The API
 * package cannot import the templates itself (they are `.tsx`, which the contract script's Node
 * cannot load), so `apps/web` wires this in.
 */
export function createSubstitutionSender({
  sendEmail,
}: SubstitutionSenderOptions): (mail: SubstitutionMail) => Promise<void> {
  return async (mail) => {
    await sendEmail({
      template: substitutionEmail,
      props: {
        workspaceName: mail.workspaceName,
        workspaceSlug: mail.workspaceSlug,
        sessionId: mail.session.id,
        className: mail.session.nameNl,
        classNameEn: mail.session.nameEn,
        startsAt: mail.startsAt,
        endsAt: mail.endsAt,
        location: mail.location.address
          ? `${mail.location.name}, ${addressLine(mail.location.address)}`
          : mail.location.name,
        originalName: mail.originalName,
      },
      to: mail.to,
      locale: mail.locale,
      timeZone: mail.timeZone,
      event: mail.event,
    });
  };
}
