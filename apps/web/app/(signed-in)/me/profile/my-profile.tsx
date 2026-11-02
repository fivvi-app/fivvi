import type { Schemas } from '@fivvi/contract';
import { Card, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { useTranslations } from 'next-intl';
import { NameForm } from './name-form';
import { TrainsHereSwitch } from './trains-here-switch';

/** A workspace of the account's own team roles, as `GET /v1/me/workspaces` lists it. */
export type MyWorkspace = Schemas['MyWorkspace'];

/**
 * TW-09 My profile (`/me/profile`, F003): the section *Mijn werkruimtes* / *My workspaces*, each
 * workspace with the person's role in it as a plain label (no switching, F012), and the name
 * (editable) and email address (read-only) of the person (F005); F010 adds the language row.
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
    <main className="flex flex-1 justify-center p-4">
      <div className="grid w-full max-w-lg content-start gap-4">
        <h1 className="font-display text-2xl font-semibold">{t('title')}</h1>
        <NameForm name={name} email={email} />
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t('workspacesTitle')}</h2>
            </CardTitle>
          </CardHeader>
          <ul className="grid gap-2 px-6 pb-6">
            {workspaces.map(({ workspaceId, name, role }) => (
              <li key={workspaceId} className="flex flex-wrap justify-between gap-2">
                <span>{name}</span>
                <span className="text-muted-foreground">{roles(role)}</span>
              </li>
            ))}
          </ul>
          {owned.length > 0 ? (
            <div className="grid gap-3 border-t px-6 pt-4 pb-6">
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
