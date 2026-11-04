import type { Locale } from '@fivvi/i18n';
import type { SendEmail } from './send.ts';
import { trainerInvitationEmail } from './templates/trainer-invitation.tsx';

/** What EM-09 needs; the invitation routes of `packages/api` decide every field (F011). */
export interface TrainerInvitationMail {
  to: { email: string; name: string };
  /** The language of the email, decided by the route (`invitationLanguage` in `@fivvi/domain`). */
  locale: Locale;
  inviterName: string;
  workspaceName: string;
  /** The workspace's IANA time zone: the expiry date is shown in it. */
  timeZone: string;
  /** The token for the link. It is in the email and nowhere else. */
  token: string;
  expiresAt: Date;
  /** One key per invitation and token, so the same send repeated goes out once. */
  idempotencyKey: string;
}

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
        url: `${appBaseUrl().replace(/\/+$/, '')}/invitations/${mail.token}`,
        expiresAt: mail.expiresAt,
      },
      to: mail.to,
      locale: mail.locale,
      timeZone: mail.timeZone,
      idempotencyKey: mail.idempotencyKey,
    });
  };
}
