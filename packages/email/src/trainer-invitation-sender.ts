import type { SendEmail } from './send.ts';
import { trainerInvitationEmail } from './templates/trainer-invitation.tsx';
import type { TrainerInvitationMail } from './trainer-invitation-mail.ts';

export interface TrainerInvitationSenderOptions {
  sendEmail: SendEmail;
  /**
   * The public address of the app (`BETTER_AUTH_URL`), where the invitation page is. A function,
   * so the environment is read when a link is made.
   */
  appBaseUrl: () => string;
}

/**
 * The function `packages/api` calls to email EM-09 (F011): renders the template in the language
 * it is given and links to `/invitations/{token}` on the app. The API package cannot import the
 * templates itself (they are `.tsx`, which the contract script's Node cannot load), so
 * `apps/web` wires this in.
 */
export function createTrainerInvitationSender({
  sendEmail,
  appBaseUrl,
}: TrainerInvitationSenderOptions): (mail: TrainerInvitationMail) => Promise<void> {
  return async (mail) => {
    await sendEmail({
      template: trainerInvitationEmail,
      props: {
        inviterName: mail.inviterName,
        workspaceName: mail.workspaceName,
        trainerWord: mail.trainerWord,
        url: `${appBaseUrl().replace(/\/+$/, '')}/invitations/${mail.token}`,
        expiresAt: mail.expiresAt,
      },
      to: mail.to,
      locale: mail.locale,
      timeZone: mail.timeZone,
      event: mail.event,
    });
  };
}
