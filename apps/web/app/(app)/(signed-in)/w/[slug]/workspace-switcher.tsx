'use client';

import type { Schemas } from '@fivvi/contract';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@fivvi/ui/components/dropdown-menu';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { rememberWorkspace, reportSwitch } from './workspace-client';
import { initials } from './workspace-initials';

/** A workspace of the person, as the switcher lists it. */
type Switchable = Pick<Schemas['MyWorkspace'], 'slug' | 'role'> & { id: string; name: string };

/**
 * The scope switcher in the sidebar header (`information-architecture.md §4.1`, F012): the
 * workspace name and the person's role in it. With one workspace and no right to create another
 * it stays the plain label; otherwise it is a menu button listing every workspace by name with
 * the role below, the current one checked. Picking another opens its home (`/w/{slug}`, which
 * shows the home of the role there) and tells the API, which only counts it. An account on the
 * sign-up allowlist (`canCreateWorkspace`) ends the list with **+ Nieuwe werkruimte**, which opens
 * TW-11. Arrow keys move, Enter picks and Escape closes, as Radix's menu does. The interface
 * language is the person's own, so nothing here touches it (ADR-017).
 */
export function WorkspaceSwitcher({
  name,
  slug,
  teamRole,
  workspaces,
  canCreateWorkspace,
}: {
  name: string;
  slug: string;
  teamRole: Schemas['MyWorkspace']['role'];
  /** Every workspace the person is on the team of, by name (`GET /v1/me`). */
  workspaces: readonly Switchable[];
  /** On the sign-up allowlist: the menu ends with *Nieuwe werkruimte*. */
  canCreateWorkspace: boolean;
}) {
  const t = useTranslations('workspaceNav');
  const switcher = useTranslations('workspaceSwitcher');
  const roles = useTranslations('roles');
  const router = useRouter();
  // The button waits for the page to hydrate: a click before that would be lost.
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);
  // Opening a workspace, however the person got there, makes it the one this browser opens next.
  useEffect(() => rememberWorkspace(slug), [slug]);

  const label = t('workspaceWithRole', { name, role: roles(teamRole) });
  if (workspaces.length < 2 && !canCreateWorkspace) {
    return (
      <div className="flex items-center gap-2.5 p-2">
        <WorkspaceLogo name={name} />
        <p className="min-w-0 flex-1 text-sm font-semibold">{label}</p>
      </div>
    );
  }

  function open(nextSlug: string) {
    const next = workspaces.find((workspace) => workspace.slug === nextSlug);
    if (!next || next.slug === slug) return;
    void reportSwitch(next.id);
    router.push(`/w/${next.slug}` as Route);
  }

  return (
    // Not modal: Radix hides the rest of the page from screen readers while a modal menu is open,
    // which leaves the focusable page behind it as an `aria-hidden` region (axe: aria-hidden-focus).
    // A click outside or Escape still closes it.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        disabled={!ready}
        className="flex w-full items-center gap-2.5 rounded-[10px] p-2 text-start text-sm font-semibold hover:bg-muted disabled:pointer-events-none"
      >
        <WorkspaceLogo name={name} />
        <span className="min-w-0 flex-1">{label}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5 shrink-0 text-muted-foreground"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56">
        <DropdownMenuRadioGroup value={slug} onValueChange={open}>
          {workspaces.map((workspace) => (
            <DropdownMenuRadioItem
              key={workspace.id}
              value={workspace.slug}
              aria-label={t('workspaceWithRole', {
                name: workspace.name,
                role: roles(workspace.role),
              })}
            >
              <span className="grid">
                <span>{workspace.name}</span>
                <span className="text-xs text-muted-foreground">{roles(workspace.role)}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {canCreateWorkspace ? (
          <>
            {workspaces.length > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem asChild>
              <Link href="/welcome">{switcher('newWorkspace')}</Link>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The logo square of a workspace: its first letters on the accent, as the prototype's sidebar header. */
function WorkspaceLogo({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-8 flex-none place-items-center rounded-[9px] bg-primary text-xs font-bold text-primary-foreground"
    >
      {initials(name)}
    </span>
  );
}
