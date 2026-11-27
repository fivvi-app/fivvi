import type { Locator, Page } from '@playwright/test';
import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  joinAsClient,
  newAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';
import { signInWithCode } from './sign-in-page';

// F030 (spec #480), the web ticket #792: the client home lists the client's studios and *Boeken*
// has the studio switcher. Anna is a client of John's Gym only; Lotte is a client of John's Gym and
// Fit Studio. Each test has accounts and workspaces of its own (see language.spec.ts). Copy comes
// from the catalogs. The client web is phone first, so the whole file runs on a phone-sized window.
test.use({ viewport: { width: 390, height: 844 } });

const JOHNS_GYM = "John's Gym";
const FIT_STUDIO = 'Fit Studio';

test.describe('F030 the client’s studios on the web', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  /** A client account of the studios, by name, each owned by an account of its own. */
  async function clientOf(label: string, ...studios: string[]) {
    const client = newAddress(label);
    await createAccount(client, undefined, label);
    for (const name of studios) {
      const owner = newAddress('owner');
      await createAccount(owner, undefined, 'Owner');
      const slug = await createGymWithTrainer(owner, name, 'owner');
      await joinAsClient(client, slug, label);
    }
    return client;
  }

  /** The studio switcher button of *Boeken*: the studio's name, in the header. */
  const switcher = (page: Page, studio: string, template: string) =>
    page.getByRole('button', { name: template.replace('{name}', studio) });

  /** The sheet *Je studio's*, and the row of a studio in it. */
  const sheet = (page: Page) => page.getByRole('dialog');
  const row = (container: Locator, studio: string) => container.getByRole('link', { name: studio });

  test('AC6: Anna signs in and the client home lists John’s Gym', async ({
    page,
    appLocale,
    messages: copy,
  }) => {
    const anna = await clientOf('anna', JOHNS_GYM);
    await page.goto('/login');

    await signInWithCode(page, copy, anna);

    await expect(page).toHaveURL('/my');
    const list = page.getByRole('region', { name: copy.clientWeb.studios.title });
    await expect(list.getByRole('link')).toHaveText([JOHNS_GYM]);
    await expect(
      page.getByRole('heading', { level: 2, name: copy.clientWeb.studios.title }),
    ).toBeVisible();
    // A client of a studio has no use of the no-studio text.
    await expect(page.getByText(copy.noWorkspace.title)).toHaveCount(0);
    await expect(page.getByText(copy.clientWeb.noWorkspace.haveLink)).toHaveCount(0);
    await expectNoAxeViolations(page, `the client home with John's Gym in ${appLocale}`);
  });

  test('AC6: a client of John’s Gym and Fit Studio sees both by name, and a row opens Boeken at that studio', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const lotte = await clientOf('lotte', JOHNS_GYM, FIT_STUDIO);
    await signInWithSession(context, lotte);

    await page.goto('/my');

    const list = page.getByRole('region', { name: copy.clientWeb.studios.title });
    // By name, as `GET /v1/me` lists them.
    await expect(list.getByRole('link')).toHaveText([FIT_STUDIO, JOHNS_GYM]);
    await expectNoAxeViolations(page, `the client home with two studios in ${appLocale}`);

    await row(list, JOHNS_GYM).click();

    await expect(page).toHaveURL('/my/book');
    await expect(switcher(page, JOHNS_GYM, copy.clientWeb.studios.switcher)).toBeVisible();
  });

  test('AC7: the switcher on Boeken opens Je studio’s with a check on the current studio, and choosing the other switches it', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const text = copy.clientWeb.studios;
    const lotte = await clientOf('lotte', JOHNS_GYM, FIT_STUDIO);
    await signInWithSession(context, lotte);
    await page.goto('/my/book');

    // The first studio by name until the client chooses one.
    const button = switcher(page, FIT_STUDIO, text.switcher);
    await expect(button).toBeEnabled();
    await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    await button.click();

    await expect(sheet(page).getByRole('heading', { name: text.yours })).toBeVisible();
    // The title names the sheet: no description that says it a second time.
    await expect(sheet(page)).toHaveAccessibleName(text.yours);
    await expect(sheet(page)).toHaveAccessibleDescription('');
    await expect(sheet(page).getByRole('link')).toHaveText([
      `${FIT_STUDIO} ${text.current}`,
      JOHNS_GYM,
    ]);
    await expect(row(sheet(page), FIT_STUDIO)).toHaveAttribute('aria-current', 'true');
    await expect(row(sheet(page), JOHNS_GYM)).not.toHaveAttribute('aria-current', 'true');
    await expectNoAxeViolations(page, `Je studio's in ${appLocale}`);

    await row(sheet(page), JOHNS_GYM).click();

    await expect(page).toHaveURL('/my/book');
    await expect(sheet(page)).toHaveCount(0);
    await expect(switcher(page, JOHNS_GYM, text.switcher)).toBeVisible();
    await expect(switcher(page, FIT_STUDIO, text.switcher)).toHaveCount(0);
    // It stays: the browser remembers it, on a reload and on the way through the tabs.
    await page.reload();
    await expect(switcher(page, JOHNS_GYM, text.switcher)).toBeVisible();
    const tabs = page.getByRole('navigation', { name: copy.clientNav.label });
    await tabs.getByRole('link', { name: copy.clientNav.home }).click();
    await tabs.getByRole('link', { name: copy.clientNav.book }).click();
    await expect(switcher(page, JOHNS_GYM, text.switcher)).toBeVisible();
    await expectNoAxeViolations(page, `Boeken with John's Gym in ${appLocale}`);

    await expect(switcher(page, JOHNS_GYM, text.switcher)).toBeEnabled();
    await switcher(page, JOHNS_GYM, text.switcher).click();
    await expect(row(sheet(page), JOHNS_GYM)).toHaveAttribute('aria-current', 'true');
    await expect(row(sheet(page), FIT_STUDIO)).not.toHaveAttribute('aria-current', 'true');
  });

  test('AC7: Studio toevoegen explains the studio’s link or QR code and offers no search', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const text = copy.clientWeb.studios;
    const anna = await clientOf('anna', JOHNS_GYM);
    await signInWithSession(context, anna);
    await page.goto('/my/book');
    await expect(switcher(page, JOHNS_GYM, text.switcher)).toBeEnabled();
    await switcher(page, JOHNS_GYM, text.switcher).click();

    // The row names how: the studio's link or QR code.
    const add = sheet(page).getByRole('button', { name: new RegExp(text.add) });
    await expect(add).toContainText(text.addHint);
    await add.click();

    await expect(sheet(page).getByRole('heading', { name: text.add })).toBeVisible();
    await expect(sheet(page).getByText(text.addExplain)).toBeVisible();
    // No search for studios (ADR-026), and nothing to fill in.
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await expectNoAxeViolations(page, `Studio toevoegen in ${appLocale}`);

    await sheet(page).getByRole('button', { name: text.done }).click();

    await expect(sheet(page)).toHaveCount(0);
    // The sheet opens on the list again.
    await switcher(page, JOHNS_GYM, text.switcher).click();
    await expect(sheet(page).getByRole('heading', { name: text.yours })).toBeVisible();
    await sheet(page).getByRole('button', { name: text.close }).click();
    await expect(sheet(page)).toHaveCount(0);
  });

  test('AC1: with no studio, Boeken keeps the no-studio text and has no switcher', async ({
    page,
    context,
    messages: copy,
  }) => {
    const mark = newAddress('mark');
    await createAccount(mark, undefined, 'Mark Jansen');
    await signInWithSession(context, mark);

    await page.goto('/my/book');

    await expect(page.getByText(copy.noWorkspace.title)).toBeVisible();
    await expect(page.getByText(copy.clientWeb.noWorkspace.haveLink)).toBeVisible();
    await expect(page.locator('[data-slot="studio-mark"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Studio|studio)/ })).toHaveCount(0);
  });

  test('AC7: the switcher is on Boeken only, Home and Profiel show the large title alone', async ({
    page,
    context,
    messages: copy,
  }) => {
    const anna = await clientOf('anna', JOHNS_GYM);
    await signInWithSession(context, anna);

    for (const path of ['/my', '/my/profile']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(switcher(page, JOHNS_GYM, copy.clientWeb.studios.switcher)).toHaveCount(0);
    }
  });

  test('a studio address the client does not belong to changes nothing and ends at the home', async ({
    page,
    context,
    messages: copy,
  }) => {
    const anna = await clientOf('anna', JOHNS_GYM);
    await signInWithSession(context, anna);

    await page.goto('/my/studio/not-a-studio-of-anna');

    await expect(page).toHaveURL('/my');
    await expect(
      page.getByRole('region', { name: copy.clientWeb.studios.title }).getByRole('link'),
    ).toHaveText([JOHNS_GYM]);
    expect((await context.cookies()).some(({ name }) => name === 'fivvi_client_studio')).toBe(
      false,
    );
  });
});
