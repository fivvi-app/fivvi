import { Card, CardDescription, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { useTranslations } from 'next-intl';

/**
 * The no-permission page (`information-architecture.md §9.5`, F002 AC7): a team member who opens
 * a page their role may not use, here a Trainer opening Settings. It names the workspace, so the
 * person knows whom to ask.
 */
export function NoPermission({ workspace }: { workspace: string }) {
  const t = useTranslations('noPermission');
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-display">
            <h1>{t('title')}</h1>
          </CardTitle>
          <CardDescription>{t('body', { workspace })}</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
