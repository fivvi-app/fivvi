/** Who may create an account by signing in for the first time (`PRODUCT.md §27`). */
export interface SignUpAllowlist {
  /** Whether `email` (any case) is an exact entry or has the domain of an `@domain` entry. */
  allows(email: string): boolean;
}

const EXACT_ADDRESS = /^[^\s@*]+@[^\s@*]+$/;
const DOMAIN_ENTRY = /^@[^\s@*]+$/;

/** Nobody: sign-up stays closed until the operator allows addresses. */
export const closedSignUp: SignUpAllowlist = { allows: () => false };

/**
 * Reads `SIGN_UP_ALLOWED_EMAILS`: comma-separated exact addresses (`pilot@gym.test`) and
 * `@domain` entries (`@example.com`, which covers that domain only, not its subdomains).
 * Case-insensitive; spaces and empty entries are ignored; no value allows nobody.
 *
 * A malformed entry (say `example.com` or `*@example.com`) throws instead of being skipped: a
 * typo that silently locked the pilot owner out would be hard to find. The error names the
 * position, never the entry, so it is safe to log.
 */
export function parseSignUpAllowlist(value: string | undefined): SignUpAllowlist {
  const exact = new Set<string>();
  const domains = new Set<string>();
  (value ?? '').split(',').forEach((raw, index) => {
    const entry = raw.trim().toLowerCase();
    if (entry === '') return;
    if (DOMAIN_ENTRY.test(entry)) domains.add(entry);
    else if (EXACT_ADDRESS.test(entry)) exact.add(entry);
    else {
      throw new Error(
        `SIGN_UP_ALLOWED_EMAILS entry ${index + 1} is not an email address or a domain entry.`,
      );
    }
  });
  return {
    allows(email) {
      const address = email.trim().toLowerCase();
      return exact.has(address) || domains.has(address.slice(address.lastIndexOf('@')));
    },
  };
}
