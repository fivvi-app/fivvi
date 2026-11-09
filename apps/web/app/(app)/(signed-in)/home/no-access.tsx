import { Card, CardDescription, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { useTranslations } from 'next-intl';

/**
 * The no-access page (`information-architecture.md §9.5`, F002 AC5): a signed-in person who is in
 * no workspace and may not set one up, such as a client or someone whose team role was removed.
 * It never offers TW-11. *Uitloggen* / *Sign out* is in the header of every signed-in page.
 */
export function NoAccess() {
  const t = useTranslations('noAccess');
  return (
    <main className="flex flex-1 items-center justify-center bg-sidebar p-6">
      <Card className="w-full max-w-100 shadow-xs [--card-spacing:--spacing(5)]">
        <CardHeader>
          <CardTitle className="text-[22px] leading-tight font-semibold">
            <h1>{t('title')}</h1>
          </CardTitle>
          <CardDescription>{t('body')}</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
