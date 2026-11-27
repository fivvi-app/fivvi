import { InsetList, InsetListItem } from '@fivvi/ui/kit/inset-list';
import { PillButton } from '@fivvi/ui/kit/pill-button';
import { useTranslations } from 'next-intl';
import { type Studio, studioPath } from './client-studio';
import { StudioMark } from './studio-mark';

/** A check mark: the studio *Boeken* shows. Decorative: the row says "Gekozen" in hidden text. */
function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-5.5 shrink-0 text-accent-text"
    >
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

const rowClass = '-mx-4 -my-2.5 flex min-h-13 flex-1 items-center gap-3 px-4 py-2.5 text-start';

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
      {studios.map(({ slug, name }) => (
        <InsetListItem key={slug}>
          <a
            href={studioPath(slug)}
            aria-current={slug === current ? 'true' : undefined}
            className={rowClass}
          >
            <StudioMark name={name} size="lg" />
            <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{name}</span>
            {slug === current ? (
              <>
                <CheckIcon />
                <span className="sr-only"> {t('current')}</span>
              </>
            ) : null}
          </a>
        </InsetListItem>
      ))}
      <InsetListItem>
        <button type="button" onClick={onAdd} className={rowClass}>
          <span
            aria-hidden="true"
            className="grid size-[42px] shrink-0 place-items-center rounded-xl bg-secondary text-accent-text"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden="true"
              className="size-5"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
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
 * *Studio toevoegen*: how a client gets a studio, which is through the studio's own link or QR
 * code. There is no search for studios (ADR-026), so nothing here asks for anything. `close` ends
 * the dialog.
 */
export function AddStudio({ close }: { close?: () => void }) {
  const t = useTranslations('clientWeb.studios');
  return (
    <div className="grid gap-4">
      <p className="text-[17px] leading-snug text-muted-foreground">{t('addExplain')}</p>
      {close ? (
        <PillButton variant="tonal" onClick={close} className="w-full">
          {t('done')}
        </PillButton>
      ) : null}
    </div>
  );
}
