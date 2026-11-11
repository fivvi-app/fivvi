/**
 * The join link of a workspace (F029, spec #484): `{app address}/j/{code}`. The code is made in
 * the database (`new_join_code()`, migration `0026`) from its CSPRNG; this is the format it
 * promises and the link built from it.
 */

/** Crockford's base32: digits and letters without I, L, O and U, so a code read aloud or typed from a poster is not mistaken. */
export const JOIN_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** The length of a join code, in characters of `JOIN_CODE_ALPHABET`. */
export const JOIN_CODE_LENGTH = 8;

/** The full URL of the join link of a code, on the address the app is served at. */
export function joinLinkUrl(appBaseUrl: string, code: string): string {
  return `${appBaseUrl.replace(/\/+$/, '')}/j/${code}`;
}
