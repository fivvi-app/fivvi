import { ChevronRightIcon } from '@fivvi/ui/kit/icons';
import { InsetList, InsetListItem } from '@fivvi/ui/kit/inset-list';
import { useTranslations } from 'next-intl';
import type { Studio } from './client-studio';
import { StudioRow } from './studio-row';

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
        {studios.map((studio) => (
          <InsetListItem key={studio.slug}>
            <StudioRow studio={studio}>
              <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
            </StudioRow>
          </InsetListItem>
        ))}
      </InsetList>
    </section>
  );
}
