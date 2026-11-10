import { randomInt } from 'node:crypto';

/** A random 6-digit code, the same for the sign-in code and the email-change code. */
export const generateCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

/**
 * Hands the work that follows a request's answer to `runInBackground` as a task that never
 * rejects: a failure goes to `reportError`, and if that throws too, it is swallowed. The caller
 * must never put the address or the code in what `reportError` logs.
 */
export function runSettled(
  runInBackground: (task: Promise<void>) => void,
  reportError: (error: unknown) => void,
  work: () => Promise<void>,
) {
  runInBackground(
    work().catch((error: unknown) => {
      try {
        reportError(error);
      } catch {
        // Reporting must never turn into a second failure: the task never rejects.
      }
    }),
  );
}
