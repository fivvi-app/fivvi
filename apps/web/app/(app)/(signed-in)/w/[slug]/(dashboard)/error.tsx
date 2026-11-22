'use client';

import { Button } from '@fivvi/ui/components/button';
import { useTranslations } from 'next-intl';

/**
 * The error state of the Dashboard (WC-01): the words and *Opnieuw proberen*, which asks the
 * server for the day again (`retry`; `reset` would draw the failed render once more).
 */
export default function DashboardError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations('workspaceDashboard');
  return (
    <main className="flex-1 px-4 pt-5 pb-10 md:px-6">
      <div className="grid max-w-275 content-start justify-items-start gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        <p role="alert">{t('errorTitle')}</p>
        <Button type="button" variant="outline" onClick={() => retry()}>
          {t('retry')}
        </Button>
      </div>
    </main>
  );
}
