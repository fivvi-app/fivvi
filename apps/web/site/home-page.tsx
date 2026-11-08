import type { Locale } from '@fivvi/i18n';
import { Chain, Cta, ForWhom, Hero, OnePlace, Platforms, Promises } from './home/sections';
import { builtPages, type SitePage } from './routes';

/**
 * The home page (F064, #611): the headline with the miniature, the *I am* switch with the screens
 * it picks, the five places, the sample booking, the audiences, the platforms, the promises and
 * the closing call to action. A page that does not exist yet is not linked (`built`). All text is
 * in the HTML without script; the switches and the sample booking are small client components.
 */
export function HomePage({
  locale,
  built = builtPages,
}: {
  locale: Locale;
  built?: readonly SitePage[];
}) {
  return (
    <>
      <Hero locale={locale} built={built} />
      <OnePlace locale={locale} />
      <Chain locale={locale} />
      <ForWhom locale={locale} built={built} />
      <Platforms locale={locale} />
      <Promises locale={locale} />
      <Cta locale={locale} built={built} />
    </>
  );
}
