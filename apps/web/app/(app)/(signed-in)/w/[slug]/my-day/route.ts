import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentMe, homeDestination, redirectTo } from '../../../../../../server/signed-in';
import { LAST_WORKSPACE_COOKIE, LAST_WORKSPACE_MAX_AGE } from '../../../../last-workspace';

/**
 * Where a Trainer lands who opens `/w/{slug}` (F014, `information-architecture.md §4.2`): their
 * home in a workspace is *Mijn dag*. The workspace address is the Owner's Dashboard, so the
 * Trainer's visit there comes here first: this makes the workspace the one this browser opens
 * next (F012 AC4) and then opens `/me/day`, which sits in that workspace's frame. The page
 * redirects with nothing to set a cookie with; the switcher, an accepted invitation and the
 * profile page send people to `/w/{slug}` and rely on this. A slug that is not one of the
 * person's workspaces goes where the signed-in home goes.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<never> {
  const { slug } = await params;
  const me = await currentMe();
  if (!me.workspaces.some((workspace) => workspace.slug === slug)) {
    redirectTo(await homeDestination(me));
  }
  (await cookies()).set(LAST_WORKSPACE_COOKIE, slug, {
    path: '/',
    maxAge: LAST_WORKSPACE_MAX_AGE,
    sameSite: 'lax',
    secure:
      new URL(request.url).protocol === 'https:' ||
      request.headers.get('x-forwarded-proto') === 'https',
  });
  redirect('/me/day');
}
