import { useTranslations } from 'next-intl';

/** The loading state of the Dashboard (WC-01): the title stays, the tiles and lanes shimmer; the page remains usable. */
export default function DashboardLoading() {
  const t = useTranslations('workspaceDashboard');
  return (
    <main aria-busy="true" className="flex-1 px-4 pt-5 pb-10 md:px-6">
      <div className="grid max-w-275 content-start gap-4">
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        <div className="h-24 animate-pulse rounded-xl border bg-muted" />
        <div className="h-64 animate-pulse rounded-xl border bg-muted" />
      </div>
    </main>
  );
}
