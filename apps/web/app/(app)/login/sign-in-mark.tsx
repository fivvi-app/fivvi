import { useTranslations } from 'next-intl';

const BRAND = '/site-images/brand';

/**
 * The mark of the trainer web's sign-in (TW-10; owner, 9 November 2026): the wordmark at 768 px
 * and wider (Tailwind's `md`, where the workspace sidebar goes beside the content) and the plain
 * day dial below that, each with a dark file for dark mode. The browser picks one file from the
 * `<picture>`, so there is one image, named "Fivvi", and never both. The files are the brand
 * files of `docs/design/brand`, made by `pnpm --filter @fivvi/web brand-icons`.
 */
export function SignInMark() {
  const t = useTranslations('app');
  return (
    <picture>
      <source
        media="(min-width: 768px) and (prefers-color-scheme: dark)"
        srcSet={`${BRAND}/fivvi-logo-dark.svg`}
      />
      <source media="(min-width: 768px)" srcSet={`${BRAND}/fivvi-logo.svg`} />
      <source media="(prefers-color-scheme: dark)" srcSet={`${BRAND}/fivvi-day-dial-dark.svg`} />
      <img src={`${BRAND}/fivvi-day-dial.svg`} alt={t('title')} className="h-12 w-12 md:w-31" />
    </picture>
  );
}
