import type { ApiClient } from './api-client';

/** The invitation page of EM-09's link, `/invitations/{token}`, and nothing after the token. */
const INVITATION_PAGE = /^\/invitations\/([^/?#]+)$/;

/**
 * The address an invitation is for, when the sign-in page was asked for on the way to that
 * invitation (F011, #1413): `returnPath` is the page the person asked for before sign-in
 * (`safeReturnPath`), and TW-10 opens with the address filled in. The address is never in the
 * link: it is read here, on the server, from the token the link already carries
 * (`GET /v1/invitations/{token}`), which tells it only for a valid, open invitation. An expired,
 * withdrawn, used or unknown one answers the neutral 404, so there is nothing to fill in. No
 * sign-in goes along (nobody is signed in), and a failure leaves the field empty: the person types
 * their address as before. The address is not logged.
 */
export async function invitedAddress(
  api: ApiClient,
  returnPath: string | undefined,
): Promise<string | undefined> {
  const escaped = returnPath ? INVITATION_PAGE.exec(returnPath)?.[1] : undefined;
  if (!escaped) return undefined;
  let token: string;
  try {
    token = decodeURIComponent(escaped);
  } catch {
    return undefined;
  }
  try {
    const { data } = await api.GET('/v1/invitations/{token}', { params: { path: { token } } });
    return data?.email;
  } catch {
    return undefined;
  }
}
