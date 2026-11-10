import { type Locale, messages } from '@fivvi/i18n';
import { builtPages, type SitePage, sitePagePath, unlistedPages } from '../site/routes';
import { expectNoAxeViolations, SITE_AXE_TAGS, test } from './fixtures';

// F064 AC15 (#645): axe finds nothing on a site page, in light and dark, on a laptop and on a phone,
// in both languages: each language project (`nl-NL`, `en`) checks its own language, so the pair of
// projects covers both once (a language per project, not both in each, which only doubled the time
// of the CI job). It runs the rules of WCAG 2.2 A and AA and axe's best practices (landmarks,
// headings, regions). The phone is a layout of its own: another menu and one column. The page is
// judged after its animations settle (`expectNoAxeViolations`).
const PAGES: readonly SitePage[] = [...builtPages, ...unlistedPages];
const SCHEMES = ['light', 'dark'] as const;
const VIEWPORTS = {
  laptop: { width: 1280, height: 800 },
  phone: { width: 390, height: 844 },
} as const;

for (const [device, viewport] of Object.entries(VIEWPORTS)) {
  for (const scheme of SCHEMES) {
    test.describe(`F064 AC15 axe on the site on a ${device} in ${scheme} mode`, () => {
      for (const page of PAGES) {
        test(`${page} finds nothing`, async ({ page: tab, appLocale }) => {
          await tab.setViewportSize(viewport);
          await tab.emulateMedia({ colorScheme: scheme });
          await tab.goto(sitePagePath(page, appLocale));

          await expectNoAxeViolations(tab, `${page} in ${appLocale}, ${device}, ${scheme}`, {
            tags: SITE_AXE_TAGS,
          });
        });
      }
    });
  }
}

// The pages with a switch show other screens and words once the visitor chooses.
const home = (locale: Locale) => messages[locale].site.home;
const studios = (locale: Locale) => messages[locale].site.audience.studios;

for (const scheme of SCHEMES) {
  test.describe(`F064 AC15 axe after a choice, in ${scheme} mode`, () => {
    test('the home page for each audience finds nothing', async ({ page, appLocale }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(sitePagePath('home', appLocale));
      for (const audience of ['gym', 'studio', 'pt', 'client'] as const) {
        await page
          .getByRole('button', { name: home(appLocale).iAm[audience], exact: true })
          .click();

        await expectNoAxeViolations(page, `home for ${audience}, ${scheme}`, {
          tags: SITE_AXE_TAGS,
        });
      }
    });

    test('the Studios page for yoga finds nothing', async ({ page, appLocale }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(sitePagePath('studios', appLocale));
      await page.getByRole('button', { name: studios(appLocale).kind.yoga, exact: true }).click();

      await expectNoAxeViolations(page, `studios for yoga, ${scheme}`, { tags: SITE_AXE_TAGS });
    });
  });
}
