import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentMe } from '../../../../../server/signed-in';
import { CLIENT_STUDIO_COOKIE, CLIENT_STUDIO_MAX_AGE } from '../../client-studio';

/**
 * Makes a studio the one *Boeken* shows and opens *Boeken* (F030): the home's rows and *Je studio's*
 * link here. The studio is remembered in this browser (`fivvi_client_studio`, its URL name and
 * nothing else). An address that is not one of the person's studios (they never joined it, or it is
 * gone) changes nothing and ends at the home, which lists the studios they have. A GET that sets
 * a cookie is no harm: it changes only which of the person's own studios is shown, and nothing on
 * the server.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<never> {
  const { slug } = await params;
  const { clientWorkspaces } = await currentMe();
  if (!clientWorkspaces.some((studio) => studio.slug === slug)) redirect('/my');
  (await cookies()).set(CLIENT_STUDIO_COOKIE, slug, {
    path: '/',
    maxAge: CLIENT_STUDIO_MAX_AGE,
    sameSite: 'lax',
    secure:
      new URL(request.url).protocol === 'https:' ||
      request.headers.get('x-forwarded-proto') === 'https',
  });
  redirect('/my/book');
}
