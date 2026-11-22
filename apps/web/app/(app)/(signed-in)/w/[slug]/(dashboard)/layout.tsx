import type { Route } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { currentTrainsAnywhere } from '../../../../../../server/signed-in';
import { workspaceOf } from '../../../../../../server/workspace-of';

/**
 * Sends a Trainer who opens `/w/{slug}` to *Mijn dag* (F014) before the page streams. The
 * Dashboard has a loading state (`loading.tsx`), and a redirect from the page below it comes after
 * the loading state has been sent: a 200 with the redirect in the HTML, which the browser follows
 * after `load`, so a click or a navigation of a person on a slow connection (or of a test) in
 * between was cut off (#1548). A layout sits above that boundary, so its redirect is the HTTP one.
 * The page keeps its own check for what the layout does not decide (the team member who does not
 * train sees the no-permission page).
 */
export default async function DashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const workspace = await workspaceOf((await params).slug);
  if (!workspace.capabilities.includes('calendar.manage') && (await currentTrainsAnywhere())) {
    redirect(`/w/${workspace.slug}/my-day` as Route);
  }
  return children;
}
