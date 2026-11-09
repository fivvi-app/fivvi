import { CardDescription, CardHeader, CardTitle } from '@fivvi/ui/components/card';
import { useTranslations } from 'next-intl';
import { GatePage } from '../../gate-page';

/**
 * The no-access page (`information-architecture.md §9.5`, F002 AC5): a signed-in person who is in
 * no workspace and may not set one up, such as a client or someone whose team role was removed.
 * It never offers TW-11. *Uitloggen* / *Sign out* is in the header of every signed-in page.
 */
export function NoAccess() {
  const t = useTranslations('noAccess');
  return (
    <GatePage>
      <CardHeader>
        <CardTitle className="text-[22px] leading-tight font-semibold">
          <h1>{t('title')}</h1>
        </CardTitle>
        <CardDescription>{t('body')}</CardDescription>
      </CardHeader>
    </GatePage>
  );
}
