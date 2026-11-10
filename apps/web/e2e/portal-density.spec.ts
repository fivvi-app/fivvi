import type { Locator, Page } from '@playwright/test';
import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  joinTeam,
  newAddress,
  signInWithSession,
} from './accounts';
import { expect, test } from './fixtures';

// E020 (#1258): a dialog or menu opened from the trainer frame renders in a portal on <body>,
// which is touch density; the kit's portal host (`PortalDensity`) puts it back in the compact
// frame's density, as the prototype draws `.w-dialog`, `.w-input` and `.w-menu`. Copy comes from the
// catalogs. John is the Owner of John's Gym and of a second workspace, Sarah its Trainer.
const GYM = "John's Gym";
const OTHER = 'John Personal Training';
const colorSchemes = ['light', 'dark'] as const;

test.describe('E020 dialogs and menus of the trainer web are compact', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  async function johnsGym() {
    const john = newAddress('john');
    const sarah = newAddress('sarah');
    await createAccount(john, undefined, 'John');
    await createAccount(sarah, undefined, 'Sarah');
    const slug = await createGymWithTrainer(john, GYM, 'owner');
    await joinTeam(sarah, slug, 'trainer');
    await createGymWithTrainer(john, OTHER, 'owner');
    return { john, slug };
  }

  // What AC6 of the theme asks of the compact density (`size.control.compact`,
  // `density.compact.body`; theme.spec.ts reads the tokens and checks these values).
  const control = '36px';
  const body = '14px';

  /**
   * The text of `surface` and of every one of `controls` is 14 px and the surface is in the compact
   * host; with `heights` the controls are 36 px high too (a menu row is not a control: the
   * switcher's two lines of text make it taller).
   */
  async function expectCompact(surface: Locator, controls: Locator, state: string, heights = true) {
    expect(
      await surface.evaluate((element) =>
        element.closest('[data-density]')?.getAttribute('data-density'),
      ),
      `${state} density`,
    ).toBe('compact');
    await expect(surface, `${state} text`).toHaveCSS('font-size', body);
    const count = await controls.count();
    expect(count, `${state} has controls`).toBeGreaterThan(0);
    for (let index = 0; index < count; index++) {
      if (heights) {
        await expect(controls.nth(index), `${state} control ${index}`).toHaveCSS('height', control);
      }
      await expect(controls.nth(index), `${state} control ${index} text`).toHaveCSS(
        'font-size',
        body,
      );
    }
  }

  async function scheme(page: Page, colorScheme: (typeof colorSchemes)[number]) {
    await page.emulateMedia({ colorScheme });
  }

  test('AC1, AC2: the Trainers remove dialog, the quick-add dialog and the workspace switcher are compact in light and dark', async ({
    page,
    context,
    messages: copy,
  }) => {
    const { john, slug } = await johnsGym();
    await signInWithSession(context, john);

    for (const colorScheme of colorSchemes) {
      await scheme(page, colorScheme);

      await page.goto(`/w/${slug}/trainers`);
      await page.getByRole('button', { name: copy.team.remove }).click();
      const remove = page.getByRole('alertdialog');
      await expectCompact(
        remove,
        remove.getByRole('button'),
        `the remove dialog in ${colorScheme} mode`,
      );
      await remove.getByRole('button', { name: copy.team.removeDialog.cancel }).click();
      await expect(remove).toHaveCount(0);

      await page.goto(`/w/${slug}/clients`);
      await page.getByRole('button', { name: copy.clients.add }).first().click();
      const quickAdd = page.getByRole('dialog', { name: copy.clients.addDialog.title });
      await expectCompact(
        quickAdd,
        quickAdd.locator('[data-slot="button"], [data-slot="input"], [data-slot="native-select"]'),
        `the quick-add dialog in ${colorScheme} mode`,
      );
      await page.keyboard.press('Escape');
      await expect(quickAdd).toHaveCount(0);

      await page.getByRole('button', { name: `${GYM} · ${copy.roles.owner}` }).click();
      const menu = page.getByRole('menu');
      await expect(menu.getByRole('menuitemradio')).toHaveCount(2);
      await expectCompact(
        menu,
        menu.getByRole('menuitemradio'),
        `the workspace switcher in ${colorScheme} mode`,
        false,
      );
      await page.keyboard.press('Escape');
    }
  });
});
