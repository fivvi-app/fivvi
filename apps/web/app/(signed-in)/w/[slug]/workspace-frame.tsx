import type { Schemas } from '@fivvi/contract';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { UserMenu } from './user-menu';

/**
 * The frame of every page of a workspace (`information-architecture.md §4.1`): a sidebar whose
 * header shows the workspace name and the person's role in it (F003; a plain label, switching
 * comes with F012), and the navigation. A section is in it only when the API lists its
 * capability for this person in this workspace (F004, `information-architecture.md §3.2`): Trainers
 * (F003) with `team.view`, Settings with `workspace.manage` and its pages General and Language
 * (F010). A section a person can't use is absent, not greyed out, and nothing here decides from the
 * role name: the role is only the label in the header. The user menu with
 * the language switch is below them (F010), and the sidebar footer shows the person's name as
 * entered (F005). The rest of the navigation comes with F013/F014.
 */
export function WorkspaceFrame({
  name,
  slug,
  teamRole,
  capabilities,
  personName,
  children,
}: {
  name: string;
  slug: string;
  teamRole: Schemas['MyWorkspace']['role'];
  /** What the API lists for this person in this workspace; the navigation follows it. */
  capabilities: Schemas['MyWorkspace']['capabilities'];
  /** The person's own name as entered; null until they have one. */
  personName: string | null;
  children: ReactNode;
}) {
  const t = useTranslations('workspaceNav');
  const roles = useTranslations('roles');
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="grid content-start gap-4 border-b p-4 md:w-56 md:border-r md:border-b-0">
        <p className="font-display text-lg font-semibold">
          {t('workspaceWithRole', { name, role: roles(teamRole) })}
        </p>
        <nav aria-label={t('label')}>
          <div className="grid gap-1">
            {capabilities.includes('team.view') ? (
              <Link href={`/w/${slug}/trainers` as Route} className="underline">
                {t('trainers')}
              </Link>
            ) : null}
            {capabilities.includes('workspace.manage') ? (
              <>
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
              </>
            ) : null}
          </div>
        </nav>
        <UserMenu />
        {personName ? (
          <footer className="text-sm text-muted-foreground">{personName}</footer>
        ) : null}
      </aside>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
