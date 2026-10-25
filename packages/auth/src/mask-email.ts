/**
 * `j***@example.com`: the first character of the part before the `@` and the whole domain, for
 * the confirm step, which must show which account the link signs in without giving the address
 * to whoever holds the link.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  const first = [...email.slice(0, at)][0] ?? '';
  return `${first}***${email.slice(at)}`;
}
