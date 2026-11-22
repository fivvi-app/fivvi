import { productEvents } from '../../../../../../../server/product-events';
import { currentMe } from '../../../../../../../server/signed-in';

/**
 * `POST /w/{slug}/calendar/moved` (F014 WC-07, AC17): the calendar tells the server that an Owner
 * moved a session by dragging it, after F020's reschedule or F022's date edit was saved, and the
 * server records `session_moved_by_drag` with the workspace ID and the platform only (the account's
 * UUID is the distinct ID): no session, client, class or trainer, and neither the old nor the new
 * time. It writes nothing else. Only a person with `calendar.manage` in that workspace counts: a
 * member without it gets 403, and a workspace that is none of the person's gets 404 like any other
 * tenant's data; both record nothing.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const me = await currentMe();
  const workspace = me.workspaces.find((candidate) => candidate.slug === slug);
  if (!workspace) return new Response(null, { status: 404 });
  if (!workspace.capabilities.includes('calendar.manage')) {
    return new Response(null, { status: 403 });
  }
  productEvents.track({
    event: 'session_moved_by_drag',
    distinctId: me.id,
    properties: { workspace_id: workspace.id, platform: 'web' },
  });
  await productEvents.flush();
  return new Response(null, { status: 204 });
}
