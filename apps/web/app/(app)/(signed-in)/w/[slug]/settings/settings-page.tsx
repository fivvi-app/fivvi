import { PageShell } from '@fivvi/ui/kit/page-shell';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/** A settings page: the page title *Instellingen* / *Settings* above the page's card. */
export function SettingsPage({ children }: { children: ReactNode }) {
  const t = useTranslations('workspaceNav');
  return (
    <PageShell>
      <h1 className="text-xl font-semibold tracking-tight">{t('settings')}</h1>
      {children}
    </PageShell>
  );
}
