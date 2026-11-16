// The token of an invitation link (`/invitations/{token}`, F011) is a bearer secret: whoever holds
// it can read the invitation. It sits in the path, which every scrubber keeps, so it is replaced by
// the route template's own placeholder wherever a path or a URL leaves the app. The look-behind
// keeps `/trainer-invitations/{invitationId}` (an ID, not a secret) as it is.
const INVITATION_TOKEN = /(?<=\/invitations\/)[^/?#\s"'<>)]+/g;

/** Replaces the token segment of `/invitations/<token>` and `/api/v1/invitations/<token>/…`. */
export function redactInvitationToken(text: string): string {
  return text.replace(INVITATION_TOKEN, '{token}');
}
