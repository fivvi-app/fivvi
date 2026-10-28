import type { Metadata } from 'next';
import { workspaceOf } from '../../../../server/workspace-of';
import { WorkspaceHome } from './workspace-home';

export async function generateMetadata({ params }: PageProps<'/w/[slug]'>): Promise<Metadata> {
  const { name } = await workspaceOf((await params).slug);
  return { title: name };
}

/** The placeholder home of a workspace (`/w/{slug}`, F002) until F013/F014. */
export default async function WorkspacePage({ params }: PageProps<'/w/[slug]'>) {
  const { name } = await workspaceOf((await params).slug);
  return <WorkspaceHome name={name} />;
}
