import { ProCard } from '@fivvi/ui/kit/pro-card';
import { useTranslations } from 'next-intl';

/**
 * What *Home* and, until F027, *Boeken* show a person who is a client of no studio yet (F030):
 * "Ask your studio for its link." and where to open it. There is no search for studios (ADR-026)
 * and nothing here creates a workspace: that is the allowlisted account's first run, never the
 * client web's (AC5).
 */
export function NoWorkspace() {
  const t = useTranslations();
  return (
    <ProCard className="grid gap-2">
      <h2 className="text-[17px] leading-snug font-semibold">{t('noWorkspace.title')}</h2>
      <p className="text-[15px] text-muted-foreground">{t('clientWeb.noWorkspace.haveLink')}</p>
    </ProCard>
  );
}
