export type SaveBookingEmailsResult =
  | { ok: true }
  /** The sign-in ended: the person signs in again. */
  | { ok: false; reason: 'signedOut' }
  | { ok: false; reason: 'noConnection' | 'generic' };

/**
 * Switches the emails about bookings in the person's classes on or off (`PATCH /api/v1/me` with
 * `bookingEmails`, F050). The setting belongs to the account, so one call covers every workspace.
 * Nothing is checked before the request: the API's answer is the only rule.
 */
export async function saveBookingEmails(
  bookingEmails: boolean,
  fetchFn: typeof fetch = fetch,
): Promise<SaveBookingEmailsResult> {
  let response: Response;
  try {
    response = await fetchFn('/api/v1/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookingEmails }),
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  if (response.status === 200) return { ok: true };
  if (response.status === 401) return { ok: false, reason: 'signedOut' };
  return { ok: false, reason: 'generic' };
}
