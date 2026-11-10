import { Card, CardDescription, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { useTranslations } from 'next-intl';

/**
 * The home of a workspace: its name and a line, a placeholder until the owner dashboard and the
 * trainer's day (F013, F014).
 */
export function WorkspaceHome({ name }: { name: string }) {
  const t = useTranslations('workspaceHome');
  return (
    <main className="flex-1 px-6 pt-5 pb-10">
      <div className="grid max-w-275 gap-4">
        <Card className="shadow-xs [--card-spacing:--spacing(5)]">
          <CardHeader>
            <CardTitle className="text-xl leading-tight font-semibold">
              <h1>{name}</h1>
            </CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </main>
  );
}
