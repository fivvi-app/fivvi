// The lengths of a private session, on a path of their own so the web form can list them without
// the rest of the domain (like `zoned-time.ts`): pure, no imports.

/** The durations of a private session: minutes, in steps (PS-01: chips 45, 60, 90 or another value). */
export const PRIVATE_SESSION_DURATIONS = { min: 15, max: 240, step: 5 } as const;
