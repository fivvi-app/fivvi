import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/**
 * The frame of every page of a workspace (`information-architecture.md §4.1`): a sidebar whose
 * header shows the workspace name, and the navigation. Settings are in it for the Owner only
 * (F002 AC7) with its pages General and Language (F010); a Trainer never sees them. Role labels and the rest of the navigation come with
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
            <div className="grid gap-1">
              <Link href={`/w/${slug}/settings/general` as Route} className="underline">
                {t('settings')}
              </Link>
              <ul className="grid gap-1 ps-4">
                <li>
                  <Link href={`/w/${slug}/settings/general` as Route} className="underline">
                    {t('settingsGeneral')}
                  </Link>
                </li>
                <li>
                  <Link href={`/w/${slug}/settings/language` as Route} className="underline">
                    {t('settingsLanguage')}
                  </Link>
                </li>
              </ul>
            </div>
          ) : null}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
