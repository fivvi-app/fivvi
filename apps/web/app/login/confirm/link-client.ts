import { postJson } from '../post-json';

/** The `signIn.errors.*` catalog key that words a failed request, apart from a dead link. */
export type LinkErrorKey = 'noConnection' | 'generic';

export type LinkResult<T> = ({ ok: true } & T) | { ok: false; error: 'linkInvalid' | LinkErrorKey };

const BASE = '/api/auth/sign-in/link';

/**
 * Asks whose address the link signs in, which uses nothing up: opening the link must not, or an
 * email scanner would use it before the person does (R1). The address comes back masked.
 */
export async function previewLink(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<LinkResult<{ email: string }>> {
  const result = await post('/preview', token, fetchFn);
  if (!result.ok) return result;
  const email = (result.body as { email?: unknown } | null)?.email;
  return typeof email === 'string' ? { ok: true, email } : { ok: false, error: 'generic' };
}

/** The button of the confirm step: uses the link up and signs this browser in (session cookie). */
export async function confirmLink(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<LinkResult<object>> {
  const result = await post('/confirm', token, fetchFn);
  return result.ok ? { ok: true } : result;
}

async function post(
  path: string,
  token: string,
  fetchFn: typeof fetch,
): Promise<{ ok: true; body: unknown } | { ok: false; error: 'linkInvalid' | LinkErrorKey }> {
  const result = await postJson(`${BASE}${path}`, { token }, fetchFn);
  if (result.ok) return result;
  if (result.reason === 'noConnection') return { ok: false, error: 'noConnection' };
  // The page words every failure itself, from the error code: the API's `message` is English and
  // never shown. One answer covers an expired, used and replaced link (AC7).
  if (result.code === 'INVALID_OR_EXPIRED_LINK' || result.status === 400) {
    return { ok: false, error: 'linkInvalid' };
  }
  return { ok: false, error: 'generic' };
}
