/**
 * How long a seeded or factory-made trainer invitation (F011) works from now: the one place of
 * this package, kept equal to `INVITATION_VALIDITY_DAYS` of `packages/domain` (this package can't
 * import the domain; a test in `packages/api` compares the two).
 */
export const FIXTURE_INVITATION_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000;
