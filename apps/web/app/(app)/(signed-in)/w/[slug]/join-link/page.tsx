import { redirect } from 'next/navigation';

/**
 * F029's *Aanmeldlink* page (`/w/{slug}/join-link`) is TW-07 *Boekingslinks* now (F037): the join
 * link is the card at the top of `/w/{slug}/booking-links`, so the old address goes there.
 */
export default async function JoinLinkPage({ params }: PageProps<'/w/[slug]/join-link'>) {
  redirect(`/w/${encodeURIComponent((await params).slug)}/booking-links`);
}
