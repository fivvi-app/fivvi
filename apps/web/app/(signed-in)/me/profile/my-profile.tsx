import type { Schemas } from '@fivvi/contract';
import { Card, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { useTranslations } from 'next-intl';
import { NameForm } from './name-form';

/** A workspace of the account's own team roles, as `GET /v1/me/workspaces` lists it. */
export type MyWorkspace = Schemas['MyWorkspace'];

/**
 * TW-09 My profile (`/me/profile`, F003): the section *Mijn werkruimtes* / *My workspaces*, each
 * workspace with the person's role in it as a plain label (no switching, F012), and the name
 * (editable) and email address (read-only) of the person (F005); F010 adds the language row.
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
        </Card>
      </div>
    </main>
  );
}
