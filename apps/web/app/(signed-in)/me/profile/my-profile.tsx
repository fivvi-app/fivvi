import { Card, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { useTranslations } from 'next-intl';

/** A workspace of the account's own team roles, as `GET /v1/me/workspaces` lists it. */
export interface MyWorkspace {
  workspaceId: string;
  name: string;
  slug: string;
  role: 'owner' | 'trainer';
}

/**
 * TW-09 My profile (`/me/profile`, F003): the section *Mijn werkruimtes* / *My workspaces*, each
 * workspace with the person's role in it as a plain label. No switching (F012); F005 and F010 add
 * the name, email and language rows to this page.
 */
export function MyProfile({ workspaces }: { workspaces: readonly MyWorkspace[] }) {
  const t = useTranslations('myProfile');
  const roles = useTranslations('roles');
  return (
    <main className="flex flex-1 justify-center p-4">
      <div className="grid w-full max-w-lg content-start gap-4">
        <h1 className="font-display text-2xl font-semibold">{t('title')}</h1>
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
