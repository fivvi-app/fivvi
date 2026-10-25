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

/**
 * What an app's sign-in routes pass on to Better Auth: the proxy's client IP address (rate
 * limits, the session's address), the user agent and the language. Nothing else, so a cookie
 * or token in the request can't change what the call does.
 */
export function forwardedHeaders(headers: Headers): Headers {
  const forwarded = new Headers();
  for (const name of ['x-real-ip', 'user-agent', 'accept-language']) {
    const value = headers.get(name);
    if (value !== null) forwarded.set(name, value);
  }
  return forwarded;
}
