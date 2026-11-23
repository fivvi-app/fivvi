import type { PrivateSessionMail } from './private-session-mail.ts';
import type { SendEmail } from './send.ts';
import { privateSessionEmail } from './templates/private-session.tsx';
import { privateSessionCancelledEmail } from './templates/private-session-cancelled.tsx';
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
      togetherWith: mail.togetherWith ?? null,
    };
    const delivery = {
      to: mail.to,
      locale: mail.locale,
      timeZone: mail.timeZone,
      event: mail.event,
    };
    if (mail.cancelled) {
      // A cancellation names no other client: `togetherWith` is not passed on.
      const { togetherWith: _togetherWith, ...cancelled } = common;
      await sendEmail({ template: privateSessionCancelledEmail, props: cancelled, ...delivery });
      return;
    }
    if (mail.previous) {
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
    }
    await sendEmail({ template: privateSessionEmail, props: common, ...delivery });
  };
}
