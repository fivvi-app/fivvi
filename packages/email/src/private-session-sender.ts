import type { PrivateSessionMail } from './private-session-mail.ts';
import type { SendEmail } from './send.ts';
import { cancellationEmail } from './templates/cancellation.tsx';
import { privateSessionEmail } from './templates/private-session.tsx';
import { privateSessionMovedEmail } from './templates/private-session-moved.tsx';

export interface PrivateSessionSenderOptions {
  sendEmail: SendEmail;
}

/**
 * The function `packages/api` calls to email EM-11, EM-04 when the mail says the session moved
 * (F020), or EM-05 when it says the session is cancelled (F026): renders the template in the language it is given, in the workspace's time zone. The API
 * package cannot import the templates itself (they are `.tsx`, which the contract script's Node
 * cannot load), so `apps/web` wires this in.
 */
export function createPrivateSessionSender({
  sendEmail,
}: PrivateSessionSenderOptions): (mail: PrivateSessionMail) => Promise<void> {
  return async (mail) => {
    const { address } = mail.location;
    const common = {
      workspaceName: mail.workspaceName,
      startsAt: mail.startsAt,
      endsAt: mail.endsAt,
      locationName: mail.location.name,
      // The Dutch way: street, number with its addition, then postcode and city.
      locationAddress: address
        ? `${address.street} ${address.houseNumber}${address.houseNumberAddition ? ` ${address.houseNumberAddition}` : ''}, ${address.postcode} ${address.city}`
        : null,
      trainerName: mail.trainerName,
      trainerWord: mail.trainerWord,
    };
    const delivery = {
      to: mail.to,
      locale: mail.locale,
      timeZone: mail.timeZone,
      event: mail.event,
    };
    switch (mail.kind) {
      case 'cancelled':
        // A cancellation names no other client, and no class: it is the private-session variant.
        await sendEmail({
          template: cancellationEmail,
          props: { ...common, kind: 'private', className: null, classNameEn: null, message: null },
          ...delivery,
        });
        return;
      case 'moved':
        await sendEmail({
          template: privateSessionMovedEmail,
          props: {
            ...common,
            previousStartsAt: mail.previous.startsAt,
            previousEndsAt: mail.previous.endsAt,
          },
          ...delivery,
        });
        return;
      case 'planned':
        await sendEmail({
          template: privateSessionEmail,
          props: { ...common, togetherWith: mail.togetherWith ?? null },
          ...delivery,
        });
        return;
    }
  };
}
