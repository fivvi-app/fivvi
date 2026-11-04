import { SIGN_IN_PAGE } from '@fivvi/auth/return-path';
import type { Route } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { LAST_WORKSPACE_COOKIE } from '../app/last-workspace';
import { apiClient } from './api';
import { type Destination, destinationOf, type Me, pathOf } from './destination';
import { loadMe } from './me';

/**
 * Who is signed in and where they stand (`GET /v1/me`), for the pages that need sign-in. Asked
 * once per request, whatever number of layouts and pages want it. A session that ended since the
 * route guard (`proxy.ts`) let the request in goes to the sign-in page.
 */
export const currentMe = cache(async (): Promise<Me> => {
  const me = await loadMe(apiClient, await headers());
  if (!me) redirect(SIGN_IN_PAGE);
  return me;
});

/**
 * Sends the person to the page of a destination (a redirect, so it ends the request). The path is
 * one of this site's own pages, which the typed routes of Next.js can't know when it is built from
 * a workspace's URL name.
 */
export function redirectTo(destination: Destination): never {
  redirect(pathOf(destination) as Route);
}

/**
 * Where the signed-in person belongs (F002, F012): their remembered workspace, else the first by
 * name, TW-11 or the no-access page. The remembered workspace is the one last used in this
 * browser (`fivvi_last_workspace`); one the person left is skipped.
 */
export async function homeDestination(me: Me): Promise<Destination> {
  return destinationOf(me, (await cookies()).get(LAST_WORKSPACE_COOKIE)?.value);
}
