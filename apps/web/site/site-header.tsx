import type { Locale } from '@fivvi/i18n';
import { PillButton } from '@fivvi/ui/kit/pill-button';
import Link from 'next/link';
import { LanguageSwitch } from './language-switch';
import { NavLink } from './nav-link';
import { headerPages, linksTo } from './navigation';
import { builtPages, type SitePage, siteHomePath } from './routes';
import { siteText } from './text';

/** The sign-in page of the app (`app/(app)/login`). */
const SIGN_IN = '/login';

/**
 * The header of every site page (F064): the logo, the pages of the product, the language switch,
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
        <Link
          href={siteHomePath(locale) as never}
          prefetch={false}
          className="numeric mr-auto inline-flex items-baseline text-2xl font-extrabold tracking-[-0.02em]"
        >
          {t('app.title')}
          <span aria-hidden="true" className="ml-0.5 size-[7px] rounded-full bg-primary" />
        </Link>
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
                    className="block rounded-full px-3 py-1.5 text-[15px] whitespace-nowrap text-secondary-foreground hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
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
          href={SIGN_IN as never}
          prefetch={false}
          className="rounded-full px-3 py-1.5 text-[15px] whitespace-nowrap text-secondary-foreground hover:bg-muted"
        >
          {t('site.header.signIn')}
        </Link>
        {demo ? (
          <PillButton asChild size="sm">
            <Link href={demo.href as never}>{t(demo.labelKey)}</Link>
          </PillButton>
        ) : null}
      </div>
    </header>
  );
}
