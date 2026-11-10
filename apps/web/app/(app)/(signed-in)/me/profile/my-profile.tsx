import type { Schemas } from '@fivvi/contract';
import { Card, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { StatusPill } from '@fivvi/ui/kit/status-pill';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LanguageRow } from './language-row';
import { NameForm } from './name-form';
import { TrainsHereSwitch } from './trains-here-switch';

/** A workspace of the account's own team roles, as `GET /v1/me/workspaces` lists it. */
export type MyWorkspace = Schemas['MyWorkspace'];

/**
 * TW-09 My profile (`/me/profile`, F003): the section *Mijn werkruimtes* / *My workspaces*, each
 * workspace with the person's role in it, the name linking to the workspace (F012), and the name
 * (editable) and email address (read-only) of the person (F005), and the *Taal* / *Language* row
 * (F010).
 * For each workspace where the person may manage the team (the Owner) there is the switch
 * *I also train at …* (F005); a Trainer has none, because they always train.
 */
export function MyProfile({
  name,
  email,
  workspaces,
}: {
  name: string | null;
  email: string;
  workspaces: readonly MyWorkspace[];
}) {
  const t = useTranslations('myProfile');
  const roles = useTranslations('roles');
  // Shown from the capability the API lists, never from the role name (F004).
  const owned = workspaces.filter(({ capabilities }) => capabilities.includes('team.manage'));
  return (
    <main className="flex-1 px-6 pt-5 pb-10">
      <div className="grid max-w-275 content-start gap-4">
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        <NameForm name={name} email={email} />
        <LanguageRow />
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-[15px] font-semibold">{t('workspacesTitle')}</h2>
            </CardTitle>
          </CardHeader>
          <ul className="grid gap-2 px-(--card-spacing)">
            {workspaces.map(({ workspaceId, name, slug, role }) => (
              <li key={workspaceId} className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/w/${slug}` as Route} className="font-semibold hover:underline">
                  {name}
                </Link>
                <StatusPill>{roles(role)}</StatusPill>
              </li>
            ))}
          </ul>
          {owned.length > 0 ? (
            <div className="grid gap-3 border-t px-(--card-spacing) pt-4">
              {owned.map(({ workspaceId, name, trainsHere }) => (
                <TrainsHereSwitch
                  key={workspaceId}
                  workspaceId={workspaceId}
                  workspaceName={name}
                  trainsHere={trainsHere}
                />
              ))}
            </div>
          ) : null}
        </Card>
      </div>
    </main>
  );
}
