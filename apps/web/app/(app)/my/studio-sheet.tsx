import { CheckIcon } from '@fivvi/ui/kit/icons';
import { InsetList, InsetListItem } from '@fivvi/ui/kit/inset-list';
import { PillButton } from '@fivvi/ui/kit/pill-button';
import { useTranslations } from 'next-intl';
import type { Studio } from './client-studio';
import { AddMark } from './studio-mark';
import { StudioRow } from './studio-row';

/**
 * *Je studio's* / *Your studios* (`DECISIONS.md` §5b, *More than one studio*): each studio of the
 * client with a check on the current one, then *Studio toevoegen*. Choosing a studio is a link to
 * the address that makes it the current one, so it works before the page has hydrated. The
 * balances come with F033.
 */
export function StudiosList({
  studios,
  current,
  onAdd,
}: {
  studios: readonly Studio[];
  /** The URL name of the studio *Boeken* shows. */
  current: string;
  onAdd: () => void;
}) {
  const t = useTranslations('clientWeb.studios');
  return (
    <InsetList>
      {studios.map((studio) => (
        <InsetListItem key={studio.slug}>
          <StudioRow studio={studio} aria-current={studio.slug === current ? 'true' : undefined}>
            {studio.slug === current ? (
              <>
                <CheckIcon className="size-5.5 shrink-0 text-accent-text" />
                <span className="sr-only"> {t('current')}</span>
              </>
            ) : null}
          </StudioRow>
        </InsetListItem>
      ))}
      <InsetListItem>
        <button
          type="button"
          onClick={onAdd}
          className="-mx-4 -my-2.5 flex min-h-13 flex-1 items-center gap-3 px-4 py-2.5 text-start"
        >
          <AddMark />
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold">{t('add')}</span>
            <span className="block text-[15px] text-muted-foreground">{t('addHint')}</span>
          </span>
        </button>
      </InsetListItem>
    </InsetList>
  );
}

/**
 * *Studio toevoegen* (the prototype's `c-addws`): how a client gets a studio, which is through the
 * studio's own link or QR code, under a plus mark. There is no search for studios (ADR-026), so
 * nothing here asks for anything. `close` ends the dialog.
 */
export function AddStudio({ close }: { close?: () => void }) {
  const t = useTranslations('clientWeb.studios');
  return (
    <div className="grid justify-items-center gap-3 px-2 pt-1.5 text-center">
      <AddMark />
      <p className="text-[15px] leading-snug text-muted-foreground">{t('addExplain')}</p>
      {close ? (
        <PillButton variant="ghost" onClick={close} className="mt-3 w-full">
          {t('done')}
        </PillButton>
      ) : null}
    </div>
  );
}
