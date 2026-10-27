/**
 * The public-routes allow-list (E011, AC14): every operation of `openapi.json` that is declared
 * `public`, with the one-line reason an anonymous caller may call it. A `public` operation that
 * is not listed here fails the coverage check, and so does an entry for an operation that no
 * longer exists. Adding a line here is a decision a reviewer sees.
 */
export const PUBLIC_ROUTES: Readonly<Record<string, string>> = {
  getHealth: 'Railway probes it without a sign-in; it returns no data besides ok or unavailable.',
  getHello: 'The walking skeleton greeting is system data with no tenant and no personal data.',
  requestSignIn: 'The caller is not signed in yet; the answer is the same for every address.',
  exchangeSignInCode: 'The caller is not signed in yet; the emailed code is the proof.',
  signOut: 'It judges the bearer token itself and answers 401 without a valid one.',
};
