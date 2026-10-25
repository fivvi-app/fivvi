/** Where a browser goes after sign-in when no page asked for it, until F002 adds workspaces. */
export const SIGNED_IN_HOME = '/home';

/** The query parameter of `/login` that holds the page the person asked for before sign-in. */
export const RETURN_PATH_PARAM = 'returnTo';

const SIGN_IN_PAGE = '/login';
const MAX_LENGTH = 2048;
/** A base that is not this site: a parsed path that keeps it is a path of this site. */
const OTHER_SITE = 'https://other-site.invalid';
// Control characters: browsers drop tabs and line breaks inside a URL, so `/<tab>/evil.example`
// would become `//evil.example`.
// biome-ignore lint/suspicious/noControlCharactersInRegex: that is what this matches.
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/**
 * The page to return to after sign-in, from the `returnTo` parameter of `/login`, or `undefined`
 * when there is none worth keeping (AC13). Only a path of this site is kept: it starts with one
 * `/`, has no backslash or control character (browsers read `\` as `/`), and still parses to this
 * site. Anything else, such as an address on another site, is ignored, so the person goes to the
 * signed-in home and sign-in can't be used to send people to a phishing site. The sign-in page
 * itself is no place to return to.
 */
export function safeReturnPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_LENGTH)
    return undefined;
  if (!value.startsWith('/') || value.startsWith('//')) return undefined;
  if (value.includes('\\') || CONTROL_CHARACTER.test(value)) return undefined;
  if (!URL.canParse(value, OTHER_SITE)) return undefined;
  const url = new URL(value, OTHER_SITE);
  if (url.origin !== OTHER_SITE) return undefined;
  if (url.pathname === SIGN_IN_PAGE || url.pathname.startsWith(`${SIGN_IN_PAGE}/`))
    return undefined;
  // Dot segments can leave `//` in front (`/.//host`), which is another site again.
  if (url.pathname.startsWith('//')) return undefined;
  return `${url.pathname}${url.search}`;
}

/**
 * The address of the sign-in page for a visitor who asked for a page that needs sign-in: it
 * carries that page, so sign-in ends there (AC13). The `_rsc` parameter Next.js adds to its own
 * page requests is not part of the page.
 */
export function loginPath(pathname: string, search: string): string {
  const query = new URLSearchParams(search);
  if (query.has('_rsc')) {
    query.delete('_rsc');
    search = query.size > 0 ? `?${query}` : '';
  }
  const returnPath = safeReturnPath(`${pathname}${search}`);
  if (!returnPath) return SIGN_IN_PAGE;
  return `${SIGN_IN_PAGE}?${new URLSearchParams({ [RETURN_PATH_PARAM]: returnPath })}`;
}
