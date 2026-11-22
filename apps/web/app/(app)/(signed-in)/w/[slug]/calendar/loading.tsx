import { useTranslations } from 'next-intl';

/** The loading state of the calendar (WC-02): the title stays, the grid shimmers; the page remains usable. */
export default function CalendarLoading() {
  const t = useTranslations('workspaceCalendar');
  return (
    <main aria-busy="true" className="flex-1 px-4 pt-5 pb-10 md:px-6">
      <div className="grid max-w-275 content-start gap-4">
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        <div className="h-96 animate-pulse rounded-xl border bg-muted" />
      </div>
    </main>
  );
}
