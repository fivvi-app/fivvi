import type { ClassCancelledMail } from './class-cancelled-mail.ts';
import type { SendEmail } from './send.ts';
import { cancellationEmail } from './templates/cancellation.tsx';

export interface ClassCancelledSenderOptions {
  sendEmail: SendEmail;
}

/**
 * The function `packages/api` calls to email the class variant of EM-05, the notice that a class
 * date is cancelled (F026): renders the template in the language it is given, in the workspace's
 * time zone. The API package cannot import the templates itself (they are `.tsx`, which the
 * contract script's Node cannot load), so `apps/web` wires this in.
 */
export function createClassCancelledSender({
  sendEmail,
}: ClassCancelledSenderOptions): (mail: ClassCancelledMail) => Promise<void> {
  return async (mail) => {
    const { address } = mail.location;
    await sendEmail({
      template: cancellationEmail,
      props: {
        kind: 'class',
        workspaceName: mail.workspaceName,
        startsAt: mail.startsAt,
        endsAt: mail.endsAt,
        locationName: mail.location.name,
        // The Dutch way: street, number with its addition, then postcode and city.
        locationAddress: address
          ? `${address.street} ${address.houseNumber}${address.houseNumberAddition ? ` ${address.houseNumberAddition}` : ''}, ${address.postcode} ${address.city}`
          : null,
        trainerName: null,
        trainerWord: 'trainer',
        className: mail.class.nameNl,
        classNameEn: mail.class.nameEn,
        message: mail.message,
      },
      to: mail.to,
      locale: mail.locale,
      timeZone: mail.timeZone,
      event: mail.event,
    });
  };
}
