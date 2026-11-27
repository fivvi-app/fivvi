import { ChevronRightIcon } from '@fivvi/ui/kit/icons';
import { InsetList, InsetListItem } from '@fivvi/ui/kit/inset-list';
import { useTranslations } from 'next-intl';
import { type Studio, studioPath } from './client-studio';
import { StudioMark } from './studio-mark';

/**
 * *Mijn studio's* / *My studios* on the client home (F030): one row per studio the client belongs
 * to, by name, which opens that studio on *Boeken* (its client timetable, F027). The link makes
 * the studio the current one first. F029 adds the pending join requests here.
 */
export function ClientStudios({ studios }: { studios: readonly Studio[] }) {
  const t = useTranslations('clientWeb.studios');
  return (
    <section aria-labelledby="client-studios" className="grid gap-2">
      <h2 id="client-studios" className="px-1 text-[22px] leading-7 font-bold">
        {t('title')}
      </h2>
      <InsetList>
        {studios.map(({ slug, name }) => (
          <InsetListItem key={slug}>
            {/* A plain link: the address answers with the redirect to *Boeken* and a cookie. */}
            <a
              href={studioPath(slug)}
              className="-mx-4 -my-2.5 flex min-h-13 flex-1 items-center gap-3 px-4 py-2.5"
            >
              <StudioMark name={name} size="lg" />
              <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{name}</span>
              <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
            </a>
          </InsetListItem>
        ))}
      </InsetList>
    </section>
  );
}
