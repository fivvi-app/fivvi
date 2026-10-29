import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { UserMenu } from './user-menu';

/**
 * The frame of every page of a workspace (`information-architecture.md §4.1`): a sidebar whose
 * header shows the workspace name, and the navigation. Settings are in it for the Owner only
 * (F002 AC7); a Trainer never sees the link. The user menu with the language switch is below it
 * (F010). Role labels and the rest of the navigation come with
 * F003/F004 and F013/F014.
 */
export function WorkspaceFrame({
  name,
  slug,
  isOwner,
  children,
}: {
  name: string;
  slug: string;
  isOwner: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('workspaceNav');
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="grid content-start gap-4 border-b p-4 md:w-56 md:border-r md:border-b-0">
        <p className="font-display text-lg font-semibold">{name}</p>
        <nav aria-label={t('label')}>
          {isOwner ? (
            <Link href={`/w/${slug}/settings/general` as Route} className="underline">
              {t('settings')}
            </Link>
          ) : null}
        </nav>
        <UserMenu />
      </aside>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
