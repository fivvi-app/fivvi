import type { Locale } from '@fivvi/i18n';
import { StatusLine } from './status-line';
import { siteText } from './text';

/**
 * The home page's text so far (F064, #637): the headline, the lead and the status line. The rest of
 * the home page is #638. All of it is in the HTML, without JavaScript.
 */
export function HomePage({ locale }: { locale: Locale }) {
  const t = siteText(locale);
  return (
    <div className="mx-auto w-full max-w-295 px-[clamp(16px,4vw,40px)] pt-[clamp(32px,4.4vw,56px)]">
      <h1 className="max-w-[14em] text-[clamp(50px,7vw,92px)] leading-[0.98] font-bold tracking-[-0.042em] text-balance">
        {t('site.home.headline')}{' '}
        <em className="font-bold text-muted-foreground not-italic">
          {t('site.home.headlineRest')}
        </em>
      </h1>
      <p className="mt-5.5 max-w-[34em] text-[clamp(19px,2vw,22px)] leading-[1.38] text-muted-foreground text-pretty">
        {t('site.home.lead')}
      </p>
      <StatusLine>{t('site.home.status')}</StatusLine>
    </div>
  );
}
