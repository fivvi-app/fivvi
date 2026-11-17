import type { Locale } from '@fivvi/i18n';
import Link from 'next/link';
import { type BusinessDetails, business as fivviBusiness, shown } from './business';
import { footerColumns, linksTo } from './navigation';
import { builtPages, type SitePage } from './routes';
import { SiteLogo } from './site-logo';
import { siteText } from './text';

/**
 * The footer of every site page (F064, AC7): the trade name (a missing one shows nothing, never a
 * placeholder) and links to help, pricing and the legal pages. No KvK, VAT number, address or phone
 * number: those are in the terms and the privacy policy (owner, 11 November 2026, #1344). A link to
 * a page that does not exist yet is left out (`built`), and so is a column left with none.
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
  const tradeName = shown(business.tradeName);
  const columns = footerColumns
    .map(({ heading, pages }) => ({ heading, links: linksTo(pages, locale, built) }))
    .filter(({ links }) => links.length > 0);
  return (
    <footer className="mt-[clamp(56px,8vw,96px)] border-t border-border pt-10 pb-12 text-sm text-muted-foreground">
      <div className="mx-auto grid w-full max-w-295 gap-7 px-[clamp(16px,4vw,40px)] sm:grid-cols-[2fr_repeat(3,1fr)]">
        <div>
          <SiteLogo locale={locale} place="footer" />
          {tradeName ? (
            <p className="mt-2.5 leading-relaxed">
              {t('site.footer.tradeName', { name: tradeName })}
            </p>
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
                      <Link href={href} className="block py-1 hover:text-foreground">
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
