import type { PrivateSessionMailAddress } from './private-session-mail.ts';
import type { SendEmail } from './send.ts';
import { trainerChangeEmail } from './templates/trainer-change.tsx';
import type { TrainerChangeMail } from './trainer-change-mail.ts';

export interface TrainerChangeSenderOptions {
  sendEmail: SendEmail;
}

/** The Dutch way: street, number with its addition, then postcode and city. */
function addressLine(address: PrivateSessionMailAddress): string {
  return `${address.street} ${address.houseNumber}${address.houseNumberAddition ? ` ${address.houseNumberAddition}` : ''}, ${address.postcode} ${address.city}`;
}

const placeOf = ({ location }: TrainerChangeMail['dates'][number]): string =>
  location.address ? `${location.name}, ${addressLine(location.address)}` : location.name;

/**
 * The function `packages/api` calls to email EM-13, the notice of a new trainer (F023): renders the
 * template in the language it is given, in the workspace's time zone. The API package cannot import
 * the templates itself (they are `.tsx`, which the contract script's Node cannot load), so
 * `apps/web` wires this in.
 */
export function createTrainerChangeSender({
  sendEmail,
}: TrainerChangeSenderOptions): (mail: TrainerChangeMail) => Promise<void> {
  return async (mail) => {
    const [first] = mail.dates;
    const usual = placeOf(first);
    await sendEmail({
      template: trainerChangeEmail,
      props: {
        workspaceName: mail.workspaceName,
        kind: mail.session.kind,
        className: mail.session.kind === 'class' ? mail.session.nameNl : null,
        classNameEn: mail.session.kind === 'class' ? mail.session.nameEn : null,
        location: usual,
        dates: mail.dates.map((date) => ({
          startsAt: date.startsAt,
          endsAt: date.endsAt,
          // A date held somewhere else than the first one says where.
          ...(placeOf(date) === usual ? {} : { elsewhere: placeOf(date) }),
        })),
        trainerName: mail.trainerName,
        trainerWord: mail.trainerWord,
      },
      to: mail.to,
      locale: mail.locale,
      timeZone: mail.timeZone,
      event: mail.event,
    });
  };
}
