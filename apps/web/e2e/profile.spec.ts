import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  joinTeam,
  newAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';

// F005 (spec #173): a team member corrects their own name on My profile (TW-09). Copy comes from
// the catalogs. Each spec has accounts and a workspace of its own (see language.spec.ts): John
// owns John's Gym, Sarah is a Trainer there.
const GYM = "John's Gym";

test.describe('F005 my name', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  async function team() {
    const john = newAddress('john');
    const sarah = newAddress('sarah');
    await createAccount(john, undefined, 'John');
    await createAccount(sarah, undefined, 'Sara');
    const slug = await createGymWithTrainer(john, GYM, 'owner');
    await joinTeam(sarah, slug, 'trainer');
    return { john, sarah, slug };
  }

  test('AC1: Sarah changes her name and saves; the sidebar footer and the Trainers page of John show it', async ({
    page,
    context,
    browser,
    baseURL,
    appLocale,
    messages: copy,
  }) => {
    const { john, sarah, slug } = await team();
    await signInWithSession(context, sarah);

    await page.goto(`/w/${slug}`);
    const footer = page.getByRole('complementary').locator('footer');
    await expect(footer).toHaveText('Sara');
    await page.getByRole('button', { name: copy.userMenu.label }).click();
    await page.getByRole('link', { name: copy.userMenu.profile }).click();
    await expect(page).toHaveURL(/\/me\/profile$/);
    const name = page.getByLabel(copy.myProfile.nameLabel);
    await expect(name).toHaveValue('Sara');
    // The email address is plain text, not a field.
    await expect(page.getByText(sarah)).toBeVisible();
    await expect(page.getByLabel(copy.myProfile.emailLabel)).toHaveCount(0);
    await expectNoAxeViolations(page, `TW-09 in ${appLocale}`);

    // An invalid name is refused under the field, as typed, and nothing is saved.
    await name.fill('   ');
    await page.getByRole('button', { name: copy.myProfile.save }).click();
    await expect(page.locator('#person-name-error')).toHaveText(copy.myProfile.errors.nameRequired);
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expectNoAxeViolations(page, `TW-09 with a refused name in ${appLocale}`);
    await name.fill('x'.repeat(81));
    await page.getByRole('button', { name: copy.myProfile.save }).click();
    await expect(page.locator('#person-name-error')).toHaveText(copy.myProfile.errors.nameTooLong);
    expect(((await (await page.request.get('/api/v1/me')).json()) as { name: string }).name).toBe(
      'Sara',
    );

    await name.fill('Sarah de Vries');
    await page.getByRole('button', { name: copy.myProfile.save }).click();
    await expect(page.getByRole('status')).toHaveText(copy.myProfile.saved);
    // The title streams in after the body of the refresh (#353, #354), and axe wants one.
    await expect(page).toHaveTitle(copy.myProfile.title);
    // The pointer stays on the button after the click; axe judges the button at rest.
    await page.mouse.move(0, 0);
    await expectNoAxeViolations(page, `TW-09 after saving in ${appLocale}`);
    // The data path: the account holds the new name.
    expect(((await (await page.request.get('/api/v1/me')).json()) as { name: string }).name).toBe(
      'Sarah de Vries',
    );

    await page.goto(`/w/${slug}`);
    await expect(footer).toHaveText('Sarah de Vries');

    const johnsBrowser = await browser.newContext({ baseURL, extraHTTPHeaders: clientIpHeaders() });
    try {
      await signInWithSession(johnsBrowser, john);
      const johnsPage = await johnsBrowser.newPage();
      await johnsPage.goto(`/w/${slug}/trainers`);
      await expect(johnsPage.getByRole('row').nth(2)).toContainText(`Sarah de Vries${sarah}`);
      await expect(johnsPage.getByText('Sara', { exact: true })).toHaveCount(0);
    } finally {
      await johnsBrowser.close();
    }
  });
});
