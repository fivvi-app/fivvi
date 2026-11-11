import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type Locale, locales, messages } from '@fivvi/i18n';
import { expect, test } from './fixtures';

// F064 AC10, the privacy policy and the terms (#643): each page shows the text of `docs/legal` for
// its language, rendered when the site was built. Both languages are visited by every project.
// Copy comes from the catalogs, the legal text from its files (TESTING.md §5.4).
const legalDir = path.resolve(import.meta.dirname, '../../../docs/legal');
const FILES = {
  privacy: { 'nl-NL': 'privacy-policy.nl.md', en: 'privacy-policy.en.md' },
  terms: { 'nl-NL': 'terms.nl.md', en: 'terms.en.md' },
} as const;
const PATHS = {
  privacy: { 'nl-NL': '/privacy', en: '/en/privacy' },
  terms: { 'nl-NL': '/voorwaarden', en: '/en/terms' },
} as const;
const HOME: Record<Locale, string> = { 'nl-NL': '/', en: '/en' };
const DOCUMENTS = ['privacy', 'terms'] as const;

/** The plain text of the `## ` headings of a file (no inline Markdown in them). */
function headingsOf(file: string): string[] {
  const text = readFileSync(path.join(legalDir, file), 'utf8');
  return [...text.matchAll(/^## (.+)$/gm)].map(([, heading = '']) => heading);
}

for (const locale of locales) {
  const site = messages[locale].site;

  for (const document of DOCUMENTS) {
    test.describe(`F064 AC10 the ${document} page in ${locale}`, () => {
      test('shows the text of docs/legal for the language, without JavaScript', async ({
        browser,
        baseURL,
      }) => {
        const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
        const page = await context.newPage();

        await page.goto(PATHS[document][locale]);

        await expect(page.getByRole('heading', { level: 1 })).toHaveText(site[document].headline);
        const headings = headingsOf(FILES[document][locale]);
        expect(headings.length).toBeGreaterThan(1);
        for (const heading of [headings[0], headings.at(-1)]) {
          await expect(
            page.getByRole('heading', { level: 2, name: heading, exact: true }),
          ).toBeVisible();
        }
        // The text is the file's: no open value, no draft notice, no link to a Markdown file.
        const main = page.getByRole('main');
        await expect(main).not.toContainText('{{');
        await expect(main).not.toContainText('⚠️');
        expect(await main.locator('a[href$=".md"]').count()).toBe(0);
        await context.close();
      });

      test('is not the other language’s text', async ({ page }) => {
        const other = locales.find((candidate) => candidate !== locale) as Locale;
        const here = headingsOf(FILES[document][locale]);
        const there = headingsOf(FILES[document][other]);

        await page.goto(PATHS[document][locale]);

        const onlyThere = there.find((heading) => !here.includes(heading));
        expect(onlyThere).toBeDefined();
        await expect(page.getByRole('heading', { name: onlyThere, exact: true })).toHaveCount(0);
      });

      test('has the footer link to it on a page of the same language', async ({ page }) => {
        await page.goto(HOME[locale]);

        const label = site.footer[document];
        await page.getByRole('contentinfo').getByRole('link', { name: label, exact: true }).click();

        await expect(page).toHaveURL(PATHS[document][locale]);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(site[document].headline);
        // The site's pages render per request (E013: the nonce), so Next streams a page's <title>
        // after its body when a link opens it (#353). The end-of-test axe check wants the title.
        await expect(page).toHaveTitle(/\S/);
      });
    });
  }

  test.describe(`F064 AC10 the links of the legal texts in ${locale}`, () => {
    test('the link to the translation opens the other language’s page, not a file', async ({
      page,
    }) => {
      const other = locales.find((candidate) => candidate !== locale) as Locale;
      await page.goto(PATHS.privacy[locale]);

      await page
        .getByRole('main')
        .getByRole('link', { name: messages[other].site.privacy.headline, exact: true })
        .click();

      await expect(page).toHaveURL(PATHS.privacy[other]);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        messages[other].site.privacy.headline,
      );
    });
  });
}
