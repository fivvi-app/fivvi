/**
 * The limits of a class and its dates (F021, spec #427, open question 2). In a file of its own so
 * the web's forms can read them without loading the rest of the domain, as they do for the private
 * sessions' lengths (`private-session-durations.ts`).
 */
export const GROUP_CLASS_LIMITS = {
  nameMaxLength: 80,
  descriptionMaxLength: 500,
  capacity: { min: 1, max: 100 },
  duration: { min: 15, max: 240, step: 5 },
} as const;
