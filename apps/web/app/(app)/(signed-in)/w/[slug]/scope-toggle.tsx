import { Button } from '@fivvi/ui/components/button';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/**
 * The toggle *Mijn dag | {workspace}* (F014, the prototype's `w-scope` tabs): for an Owner who
 * trains and has a team, it sits on both of the days it switches between, the Owner's Dashboard
 * (`current="workspace"`) and *Mijn dag* (`current="me"`), so the way back is always one click.
 */
export function ScopeToggle({
  current,
  slug,
  workspace,
}: {
  current: 'me' | 'workspace';
  slug: string;
  workspace: string;
}) {
  const t = useTranslations('workspaceDashboard');
  const nav = useTranslations('workspaceNav');
  const link = (scope: 'me' | 'workspace', href: string, label: string) => (
    <Button asChild variant={current === scope ? 'secondary' : 'ghost'}>
      <Link href={href as Route} aria-current={current === scope ? 'page' : undefined}>
        {label}
      </Link>
    </Button>
  );
  return (
    <nav aria-label={t('scopeLabel')} className="flex gap-1">
      {link('me', '/me/day', nav('myDay'))}
      {link('workspace', `/w/${slug}`, workspace)}
    </nav>
  );
}
