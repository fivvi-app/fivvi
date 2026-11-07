import type { Locale } from '@fivvi/i18n';
import Link from 'next/link';
import { type BusinessDetails, filledDetails, business as fivviBusiness } from './business';
import { footerColumns, linksTo } from './navigation';
import { builtPages, type SitePage, siteHomePath } from './routes';
import { siteText } from './text';

/**
 * The footer of every site page (F064, AC7): the trade name, the business details that are filled
 * in (a missing one shows nothing, never a placeholder), and links to help, pricing and the legal
 * pages. A link to a page that does not exist yet is left out (`built`), and so is a column left
 * with none.
 */
export function SiteFooter({
  locale,
  business = fivviBusiness,
  built = builtPages,
}: {
  locale: Locale;
  business?: BusinessDetails;
  built?: readonly SitePage[];
}) {
  const t = siteText(locale);
  const details = filledDetails(business);
  const columns = footerColumns
    .map(({ heading, pages }) => ({ heading, links: linksTo(pages, locale, built) }))
    .filter(({ links }) => links.length > 0);
  return (
    <footer className="mt-[clamp(56px,8vw,96px)] border-t border-border pt-10 pb-12 text-sm text-muted-foreground">
      <div className="mx-auto grid w-full max-w-295 gap-7 px-[clamp(16px,4vw,40px)] sm:grid-cols-[2fr_repeat(3,1fr)]">
        <div>
          <Link
            href={siteHomePath(locale) as never}
            prefetch={false}
            className="numeric inline-flex items-baseline text-xl font-extrabold tracking-[-0.02em] text-foreground"
          >
            {t('app.title')}
            <span aria-hidden="true" className="ml-0.5 size-[6px] rounded-full bg-primary" />
          </Link>
          <p className="mt-2.5 leading-relaxed">
            {t('site.footer.tradeName', { name: business.tradeName })}
          </p>
          {details.length > 0 ? (
            <dl className="mt-1 leading-relaxed">
              {details.map(({ key, value }) => (
                <div key={key} className="flex gap-1.5">
                  <dt>{t(`site.footer.${key}`)}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        {columns.length > 0 ? (
          <nav aria-label={t('site.footer.label')} className="contents">
            {columns.map(({ heading, links }) => (
              <div key={heading}>
                <h2 className="mb-2 text-sm font-semibold text-foreground">{t(heading)}</h2>
                <ul>
                  {links.map(({ page, href, labelKey }) => (
                    <li key={page}>
                      <Link href={href as never} className="block py-1 hover:text-foreground">
                        {t(labelKey)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        ) : null}
      </div>
    </footer>
  );
}
