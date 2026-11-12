import type { EmailLanguage } from '@fivvi/i18n';

// Its own file, without the template: `packages/api` imports this type through the package's
// `./trainer-invitation-mail` export, and the API cannot load or type-check the `.tsx` templates.

/** What EM-09 needs; the invitation routes of `packages/api` decide every field (F011). */
export interface TrainerInvitationMail {
  to: { email: string; name: string };
  /** The language of the email, decided by the route (`invitationLanguage` in `@fivvi/domain`). */
  locale: EmailLanguage;
  inviterName: string;
  workspaceName: string;
  /** The workspace's IANA time zone: the expiry date is shown in it. */
  timeZone: string;
  /** The token for the link. It is in the email and nowhere else. */
  token: string;
  expiresAt: Date;
  /**
   * The event behind the mail, `{invitationId}:{tokenHash}`: one per invitation and token, so the
   * same send repeated reaches the provider with one idempotency key and goes out once (F049).
   * Built from the token's hash, never from the token.
   */
  event: string;
}
