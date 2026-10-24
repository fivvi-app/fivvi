import { eq, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client.ts';
import { authVerifications } from '../schema/index.ts';

/**
 * Counts one wrong code against a sign-in verification and deletes it once `limit` wrong codes
 * are reached, which kills the link and the code. The count goes up in one statement, so
 * guesses made in parallel are all counted.
 */
export async function recordWrongSignInCode(
  db: DatabaseExecutor,
  verificationId: string,
  limit: number,
): Promise<void> {
  const [counted] = await db
    .update(authVerifications)
    .set({ failedAttempts: sql`${authVerifications.failedAttempts} + 1` })
    .where(eq(authVerifications.id, verificationId))
    .returning({ failedAttempts: authVerifications.failedAttempts });
  if (counted && counted.failedAttempts >= limit) {
    await db.delete(authVerifications).where(eq(authVerifications.id, verificationId));
  }
}
