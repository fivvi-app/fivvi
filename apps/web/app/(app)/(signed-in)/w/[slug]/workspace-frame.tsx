import type { Schemas } from '@fivvi/contract';
import type { Locale } from '@fivvi/i18n';
import { useTranslations } from 'next-intl';
import type { ComponentProps, ReactNode } from 'react';
import { AddClientProvider } from './clients/add-client-dialog';
import { NewMenu } from './new-menu';
import { type NavItem, SidebarNav } from './sidebar-nav';
import { UserMenu } from './user-menu';
import { initials } from './workspace-initials';
import { WorkspaceSwitcher } from './workspace-switcher';

/**
 * The frame of every page of a workspace (`information-architecture.md §4.1`): a sidebar whose
 * header shows the workspace name and the person's role in it (F003) as the scope switcher (F012):
 * a plain label with one workspace, otherwise a menu of the person's workspaces, and the
 * navigation. A section is in it only when the API lists its capability for this person in this workspace (F004, `information-architecture.md §3.2`): Clients
 * (F006) with `clients.view`, Trainers (F003) with `team.view`, Settings with `workspace.manage` and its pages General and Language
 * (F010), plus Location (F015) with `settings.manage`. A section a person can't use is absent, not greyed out, and nothing here decides from the
 * role name: the role is only the label in the header. The user menu with
 * the language switch is below them (F010), and the sidebar footer shows the person's name as
 * entered (F005). With `clients.manage` (`quickAdd`) the top bar has **+ Nieuw** → *Klant*, which
 * opens the quick-add dialog (F006) that the list's *Klant toevoegen* opens as well. The rest of
 * the navigation comes with F013/F014.
 */
export function WorkspaceFrame({
  name,
  slug,
  teamRole,
  workspaces,
  canCreateWorkspace,
  capabilities,
  personName,
  quickAdd,
  children,
}: {
  name: string;
  slug: string;
  teamRole: Schemas['MyWorkspace']['role'];
  /** Every workspace the person is on the team of, by name: the scope switcher lists them (F012). */
  workspaces: ComponentProps<typeof WorkspaceSwitcher>['workspaces'];
  /** On the sign-up allowlist: the scope switcher ends with *Nieuwe werkruimte* (F012). */
  canCreateWorkspace: boolean;
  /** What the API lists for this person in this workspace; the navigation follows it. */
  capabilities: Schemas['MyWorkspace']['capabilities'];
  /** The person's own name as entered; null until they have one. */
  personName: string | null;
  /** The workspace to add clients to; given only to a person with `clients.manage` (F006). */
  quickAdd?: { workspaceId: string; defaultLocale: Locale };
  children: ReactNode;
}) {
  const t = useTranslations('workspaceNav');
  const items: NavItem[] = [];
  if (capabilities.includes('clients.view')) {
    items.push({ href: `/w/${slug}/clients`, label: t('clients'), icon: 'clients' });
  }
  if (capabilities.includes('team.view')) {
    items.push({ href: `/w/${slug}/trainers`, label: t('trainers'), icon: 'trainers' });
  }
  if (capabilities.includes('workspace.manage')) {
    items.push({
      href: `/w/${slug}/settings/general`,
      base: `/w/${slug}/settings`,
      label: t('settings'),
      icon: 'settings',
      children: [
        { href: `/w/${slug}/settings/general`, label: t('settingsGeneral') },
        { href: `/w/${slug}/settings/language`, label: t('settingsLanguage') },
        ...(capabilities.includes('settings.manage')
          ? [{ href: `/w/${slug}/settings/locations`, label: t('settingsLocation') }]
          : []),
      ],
    });
  }
  return (
    <div data-density="compact" className="flex flex-1 flex-col md:flex-row">
      <aside className="flex flex-col gap-1 border-b bg-sidebar px-2.5 py-3 md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <WorkspaceSwitcher
          name={name}
          slug={slug}
          teamRole={teamRole}
          workspaces={workspaces}
          canCreateWorkspace={canCreateWorkspace}
        />
        <SidebarNav label={t('label')} items={items} />
        <div className="mt-auto flex items-center gap-2.5 border-t px-2 pt-2.5">
          {personName ? (
            <>
              <span
                aria-hidden="true"
                className="grid size-7 flex-none place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground"
              >
                {initials(personName)}
              </span>
              <footer className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                {personName}
              </footer>
            </>
          ) : (
            <span className="flex-1" />
          )}
          <UserMenu />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {quickAdd ? (
          <AddClientProvider
            workspaceId={quickAdd.workspaceId}
            slug={slug}
            defaultLocale={quickAdd.defaultLocale}
          >
            <div className="flex h-15 flex-none items-center justify-end border-b px-6">
              <NewMenu />
            </div>
            {children}
          </AddClientProvider>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
