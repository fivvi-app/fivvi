import { useFormatter } from 'next-intl';

/**
 * The large title of a client web page, with the date above it (`DECISIONS.md` §2 and §5b *The
 * header*: *Home* and *Profiel* show only the large title with the date above it, no studio badge).
 * The date is today's, in the page's language and the default time zone.
 */
export function ClientTitle({ title }: { title: string }) {
  const format = useFormatter();
  return (
    <div className="px-1 pt-1 pb-4">
      <p className="text-[13px] font-semibold tracking-[0.02em] text-muted-foreground uppercase">
        {format.dateTime(new Date(), 'date')}
      </p>
      <h1 className="text-[34px] leading-[41px] font-bold">{title}</h1>
    </div>
  );
}
