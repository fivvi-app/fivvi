import { eq } from 'drizzle-orm';
import type { Database } from '../client.ts';
import { systemGreetings } from '../schema/index.ts';

export interface SystemGreetingView {
  slug: string;
  i18nKey: string;
}

export async function findSystemGreeting(
  db: Database,
  slug: string,
): Promise<SystemGreetingView | undefined> {
  const [row] = await db
    .select({ slug: systemGreetings.slug, i18nKey: systemGreetings.i18nKey })
    .from(systemGreetings)
    .where(eq(systemGreetings.slug, slug))
    .limit(1);
  return row;
}
