import { Card, CardDescription, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { useTranslations } from 'next-intl';

/**
 * The home of a workspace: its name and a line, a placeholder until the owner dashboard and the
 * trainer's day (F013, F014).
 */
export function WorkspaceHome({ name }: { name: string }) {
  const t = useTranslations('workspaceHome');
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-display">
            <h1>{name}</h1>
          </CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
