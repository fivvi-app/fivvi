import { formattingLocales, messages } from '@trainer-hub/i18n';
import { localeCookie } from '../i18n/config';
import { expect, expectNoAxeViolations, test } from './fixtures';

// Runs in every locale project. Copy comes from the catalogs (TESTING.md §5.4).
test.describe('E010 home page', () => {
  test('renders in the browser language', async ({ page, appLocale, messages: copy }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', formattingLocales[appLocale]);
    await expect(page).toHaveTitle(copy.app.title);
    await expect(page.getByRole('heading', { level: 1, name: copy.hello.title })).toBeVisible();
  });

  test('switches to the other language when the user chooses it', async ({
    page,
    context,
    baseURL,
    appLocale,
    otherLocale,
  }) => {
    await page.goto('/');
    await expectNoAxeViolations(page, `the home page in ${appLocale}`);

    // The explicit choice (the language switch, F010) is stored in this cookie and wins
    // over the browser language.
    await context.addCookies([{ name: localeCookie, value: otherLocale, url: baseURL }]);
    await page.reload();

    await expect(page.locator('html')).toHaveAttribute('lang', formattingLocales[otherLocale]);
    await expect(
      page.getByRole('heading', { level: 1, name: messages[otherLocale].hello.title }),
    ).toBeVisible();
    // The page in the other language is checked by the automatic axe fixture.
  });
});

test.describe('E007 hello page', () => {
  test('greets the first name entered in the form', async ({ page, messages: copy }) => {
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveCount(0);

    await page.getByLabel(copy.hello.firstNameLabel).fill('  Sam  ');
    await page.getByRole('button', { name: copy.hello.continue }).click();

    await expect(page.getByRole('status')).toHaveText(
      copy.hello.formGreeting.replace('{name}', 'Sam'),
    );
    await expect(page.getByLabel(copy.hello.firstNameLabel)).toHaveValue('Sam');
  });
});
