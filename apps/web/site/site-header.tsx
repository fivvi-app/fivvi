import { SIGN_IN_PAGE } from '@fivvi/auth/return-path';
import type { Locale } from '@fivvi/i18n';
import { PillButton } from '@fivvi/ui/kit/pill-button';
import Link from 'next/link';
import { LanguageSwitch } from './language-switch';
import { NavLink } from './nav-link';
import { headerPages, linksTo } from './navigation';
import { builtPages, type SitePage } from './routes';
import { SiteLogo } from './site-logo';
import { siteText } from './text';

/**
 * The header of every site page (F064): the wordmark, the pages of the product, the language switch,
 * *Sign in* and *Plan een demo*. Links to pages that do not exist yet are left out (`built`).
 */
export function SiteHeader({
  locale,
  built = builtPages,
}: {
  locale: Locale;
  built?: readonly SitePage[];
}) {
  const t = siteText(locale);
  const pages = linksTo(headerPages, locale, built);
  const [demo] = linksTo(['demo'], locale, built);
  return (
    <header className="glass sticky top-0 z-20">
      <a
        href="#main"
        className="sr-only rounded-full bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        {t('site.header.skipToContent')}
      </a>
      <div className="mx-auto flex w-full max-w-295 flex-wrap items-center gap-x-4 gap-y-2 px-[clamp(16px,4vw,40px)] py-2.5">
        <div className="mr-auto">
          <SiteLogo locale={locale} place="header" />
        </div>
        {pages.length > 0 ? (
          <nav
            aria-label={t('site.header.menuLabel')}
            className="order-last w-full sm:order-none sm:w-auto"
          >
            <ul className="flex gap-0.5 overflow-x-auto">
              {pages.map(({ page, href, labelKey }) => (
                <li key={page}>
                  <NavLink
                    href={href}
                    className="block rounded-full px-3 py-1.5 text-[15px] whitespace-nowrap text-secondary-foreground hover:bg-foreground/10 aria-[current=page]:bg-foreground/15 aria-[current=page]:font-semibold aria-[current=page]:text-foreground dark:aria-[current=page]:bg-foreground/30"
                  >
                    {t(labelKey)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        <LanguageSwitch
          label={t('site.language.label')}
          current={locale}
          options={[
            {
              locale: 'nl-NL',
              lang: 'nl',
              short: t('site.language.nlShort'),
              name: t('site.language.nlName'),
            },
            {
              locale: 'en',
              lang: 'en',
              short: t('site.language.enShort'),
              name: t('site.language.enName'),
            },
          ]}
        />
        {/* The sign-in page belongs to the app, which has its own root layout: a full page load. */}
        <Link
          href={SIGN_IN_PAGE}
          prefetch={false}
          className="rounded-full px-3 py-1.5 text-[15px] whitespace-nowrap text-secondary-foreground hover:bg-foreground/10"
        >
          {t('site.header.signIn')}
        </Link>
        {demo ? (
          <PillButton asChild size="sm">
            <Link href={demo.href}>{t(demo.labelKey)}</Link>
          </PillButton>
        ) : null}
      </div>
    </header>
  );
}
