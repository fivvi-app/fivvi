/**
 * The headers of a bearer request without its cookies, or `undefined` for a request without an
 * `Authorization` header. A request that carries one is judged by its token alone: an invalid
 * token is anonymous, never the cookie next to it (spec #168).
 */
export function bearerOnly(headers: Headers): Headers | undefined {
  if (!headers.has('authorization')) return undefined;
  const only = new Headers(headers);
  only.delete('cookie');
  return only;
}

/** The headers without `Authorization`, for a request that only a cookie may sign in (web pages). */
export function withoutAuthorization(headers: Headers): Headers {
  const cookies = new Headers(headers);
  cookies.delete('authorization');
  return cookies;
}

/**
 * Better Auth's `bearer` plugin copies the session cookie of every sign-in response into a
 * `set-auth-token` header (and lists it in `Access-Control-Expose-Headers`), which page script
 * could read. The web keeps its session in the HttpOnly cookie alone (spec #168), so the
 * response of `handler` loses both. Apps get their token from `exchangeSignInCode`, which calls
 * the endpoint directly and never goes through here.
 */
export function withoutAuthToken(response: Response): Response {
  response.headers.delete('set-auth-token');
  const exposed = (response.headers.get('access-control-expose-headers') ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '' && name.toLowerCase() !== 'set-auth-token');
  if (exposed.length > 0) response.headers.set('access-control-expose-headers', exposed.join(', '));
  else response.headers.delete('access-control-expose-headers');
  return response;
}
