import type { Locator, Page } from '@playwright/test';
import { clientIpHeaders, signInWithSession } from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';
import {
  seedBoxing,
  seedClient,
  seedPrivate,
  storedSession,
  team,
  thursday,
  wording,
} from './trainer-assignment-world';

// F023 (spec #459, ticket #541): the entry points of CO-02 on the calendar: *Aandacht nodig* →
// *Toewijzen*, the quick view, and dragging a block to another trainer's column of the day view,
// and PS-07 on a WC-07 drag into an overlap. Copy comes from the catalogs. The grid is 48 px an
// hour from 06:00 (nothing here starts earlier): a minute is 0.8 px. John owns John's Gym and
// trains there; Sarah, Tom and Mike are its Trainers.
const MINUTE_PX = 0.8;

/** The blocks of the calendar: each opens the quick view. */
const blocks = (page: Page) => page.getByRole('main').locator('button[aria-haspopup="dialog"]');
/** The columns of the grid, in order. */
const gridColumns = (page: Page) => page.locator('[data-slot="week-grid-body"] > [data-column]');

/** Drags the block from its middle by `minutes` (60 minutes are 48 px), over several pointer moves. */
async function dragBlock(page: Page, block: Locator, minutes: number) {
  const box = await block.boundingBox();
  if (!box) throw new Error('The block is not on the page.');
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height / 2, 20);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + (minutes * MINUTE_PX) / 2, { steps: 6 });
  await page.mouse.move(x, y + minutes * MINUTE_PX, { steps: 6 });
  await page.mouse.up();
}

/** Drags the block sideways, to the middle of `column` and the minute it is at. */
async function dragToColumn(page: Page, block: Locator, column: Locator) {
  const from = await block.boundingBox();
  await column.scrollIntoViewIfNeeded();
  const to = await column.boundingBox();
  if (!from || !to) throw new Error('The block or the column is not on the page.');
  const y = from.y + Math.min(from.height / 2, 20);
  const x = from.x + from.width / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move((x + to.x + to.width / 2) / 2, y, { steps: 6 });
  await page.mouse.move(to.x + to.width / 2, y, { steps: 8 });
  await page.mouse.up();
}

/** The column of the day view headed `label`. */
async function columnOf(page: Page, label: string) {
  const headers = await page.locator('[data-slot="week-grid-header"] > div').allInnerTexts();
  const index = headers.findIndex((header) => header.trim() === label);
  if (index < 0) throw new Error(`No column ${label} in ${headers.join(', ')}.`);
  return gridColumns(page).nth(index);
}

test.describe('F023 the entry points of CO-02 on the calendar', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  test('AC1: Toewijzen on Aandacht nodig opens CO-02 on Boxing; assigning Tom takes it off the list', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const boxing = await seedBoxing(page.request, w.base);
    await page.goto(`/w/${w.slug}`);

    await expect(
      page.getByRole('heading', { name: copy.workspaceDashboard.attentionTitle }),
    ).toBeVisible();
    await page
      .getByRole('link', {
        name: copy.workspaceDashboard.assignLabel.replace('{item}', '').trim() + ' Boxing',
        exact: false,
      })
      .click();

    // The class date opens with the trainer dialog on it.
    await expect(page).toHaveURL(
      new RegExp(`/classes/${boxing.classId}/${boxing.sessionId}\\?assign=1`),
    );
    const dialog = page.getByRole('dialog', { name: text.titleAssign });
    await expect(dialog.getByText(text.t('whoAssign'))).toBeVisible();
    await expectNoAxeViolations(page, `CO-02 opened from Aandacht nodig in ${appLocale}`);
    await dialog.getByRole('radio', { name: 'Tom' }).check();
    await dialog.getByRole('button', { name: text.t('submitAssign') }).click();

    await expect(
      page.getByRole('status').filter({
        hasText: text.t('doneClass', {
          trainer: 'Tom',
          class: 'Boxing',
          date: text.day((await storedSession(page.request, w.base, boxing.sessionId)).startsAt),
        }),
      }),
    ).toBeVisible();
    expect((await storedSession(page.request, w.base, boxing.sessionId)).trainer?.name).toBe('Tom');
    await page.goto(`/w/${w.slug}`);
    await expect(
      page.getByRole('main').getByText(copy.workspaceDashboard.attentionNone),
    ).toBeVisible();
  });

  test('WC-05: the quick view of a class date without a trainer has Trainer toewijzen and of a private session Trainer wijzigen, each opening the dialog; a Trainer has none', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const boxing = await seedBoxing(page.request, w.base);
    const mark = await seedClient(page.request, w.base, 'Mark Jansen');
    const session = await seedPrivate(page.request, w.base, {
      clientId: mark.id,
      trainerId: w.trainer('Sarah'),
      localDate: thursday(),
      localStart: '09:00',
    });
    await page.setViewportSize({ width: 1280, height: 1500 });
    await page.goto(`/w/${w.slug}/calendar?date=${thursday()}&view=week`);
    // The quick view is named by its block ("Privé · Mark Jansen"); it is the one dialog on the page.
    const quickView = page.getByRole('dialog');

    await blocks(page).filter({ hasText: 'Mark Jansen' }).click();
    await expect(quickView.getByRole('link', { name: text.titleChange })).toBeVisible();
    await expectNoAxeViolations(page, `the quick view with Trainer wijzigen in ${appLocale}`);
    await quickView.getByRole('button', { name: copy.workspaceCalendar.close }).click();

    await blocks(page).filter({ hasText: 'Boxing' }).click();
    await quickView.getByRole('link', { name: text.titleAssign }).click();
    await expect(page).toHaveURL(
      new RegExp(`/classes/${boxing.classId}/${boxing.sessionId}\\?assign=1`),
    );
    await expect(page.getByRole('dialog', { name: text.titleAssign })).toBeVisible();

    // Trainer wijzigen from the quick view opens on the private session's page.
    await page.goto(`/w/${w.slug}/calendar?date=${thursday()}&view=week`);
    await blocks(page).filter({ hasText: 'Mark Jansen' }).click();
    await quickView.getByRole('link', { name: text.titleChange }).click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${session.id}\\?assign=1`));
    await expect(page.getByRole('dialog', { name: text.titleChange })).toBeVisible();

    // A Trainer's quick view has none of them.
    await context.clearCookies();
    await signInWithSession(context, w.sarah);
    await page.goto(`/w/${w.slug}/calendar?date=${thursday()}&view=week`);
    await blocks(page).filter({ hasText: 'Boxing' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('link', { name: text.titleAssign })).toHaveCount(0);
  });

  test('WC-03: dragging Boxing to Tom’s column opens CO-02 with Tom chosen, and Mark’s session to Tom’s column opens Trainer wijzigen with Tom', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 1500 });
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const boxing = await seedBoxing(page.request, w.base);
    const mark = await seedClient(page.request, w.base, 'Mark Jansen');
    const session = await seedPrivate(page.request, w.base, {
      clientId: mark.id,
      trainerId: w.trainer('Sarah'),
      localDate: thursday(),
      localStart: '09:00',
    });
    await page.goto(`/w/${w.slug}/calendar?date=${thursday()}&view=day`);

    await dragToColumn(
      page,
      blocks(page).filter({ hasText: 'Boxing' }),
      await columnOf(page, 'Tom'),
    );
    const dialog = page.getByRole('dialog', { name: text.titleAssign });
    await expect(dialog.getByRole('radio', { name: 'Tom' })).toBeChecked();
    await expectNoAxeViolations(page, `CO-02 opened by dragging to a column in ${appLocale}`);
    // Annuleren leaves the block where it was.
    await dialog.getByRole('button', { name: text.t('cancel') }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await storedSession(page.request, w.base, boxing.sessionId)).trainer).toBeUndefined();

    await dragToColumn(
      page,
      blocks(page).filter({ hasText: 'Boxing' }),
      await columnOf(page, 'Tom'),
    );
    await page
      .getByRole('dialog', { name: text.titleAssign })
      .getByRole('button', { name: text.t('submitAssign') })
      .click();
    await expect
      .poll(async () => (await storedSession(page.request, w.base, boxing.sessionId)).trainer?.name)
      .toBe('Tom');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('status').filter({
        hasText: text.t('doneClass', {
          trainer: 'Tom',
          class: 'Boxing',
          date: text.day((await storedSession(page.request, w.base, boxing.sessionId)).startsAt),
        }),
      }),
    ).toBeVisible();

    // Mark's session is Sarah's: dragged to Tom's column it asks Trainer wijzigen with Tom chosen.
    await dragToColumn(
      page,
      blocks(page).filter({ hasText: 'Mark Jansen' }),
      await columnOf(page, 'Tom'),
    );
    const change = page.getByRole('dialog', { name: text.titleChange });
    await expect(change.getByLabel(text.word.Word)).toHaveValue(w.trainer('Tom'));
    await expectNoAxeViolations(page, `Trainer wijzigen opened by dragging in ${appLocale}`);
    await change.getByRole('button', { name: text.t('submitChange') }).click();
    await expect
      .poll(async () => (await storedSession(page.request, w.base, session.id)).trainer?.name)
      .toBe('Tom');
  });

  test('AC5: dragging Mark’s session onto Sarah’s other session shows PS-07; Terug keeps the question, Toch opslaan moves it', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 1500 });
    const w = await team(page, context);
    const mark = await seedClient(page.request, w.base, 'Mark Jansen');
    const anna = await seedClient(page.request, w.base, 'Anna de Vries');
    const sarah = w.trainer('Sarah');
    const first = await seedPrivate(page.request, w.base, {
      clientId: mark.id,
      trainerId: sarah,
      localDate: thursday(),
      localStart: '09:00',
    });
    await seedPrivate(page.request, w.base, {
      clientId: anna.id,
      trainerId: sarah,
      localDate: thursday(),
      localStart: '10:00',
    });
    await page.goto(`/w/${w.slug}/calendar?date=${thursday()}&view=week`);

    await dragBlock(page, blocks(page).filter({ hasText: 'Mark Jansen' }), 60);
    const move = page.getByRole('dialog', {
      name: copy.workspaceCalendar.moveTitle.replace('{name}', 'Mark Jansen'),
    });
    await move.getByRole('button', { name: copy.workspaceCalendar.moveConfirm }).click();

    const warning = page.getByRole('alertdialog');
    await expect(
      warning.getByRole('heading', {
        name: copy.sessions.doubleBooking.title.replace('{trainer}', 'Sarah'),
      }),
    ).toBeVisible();
    await expect(warning.getByText(/Anna de Vries/)).toBeVisible();
    await expectNoAxeViolations(page, `PS-07 on a drag in ${appLocale}`);
    await warning.getByRole('button', { name: copy.sessions.doubleBooking.back }).click();
    await expect(warning).toHaveCount(0);
    await expect(move).toBeVisible();
    expect(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Amsterdam',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date((await storedSession(page.request, w.base, first.id)).startsAt)),
    ).toBe('09:00');

    await move.getByRole('button', { name: copy.workspaceCalendar.moveConfirm }).click();
    await warning.getByRole('button', { name: copy.sessions.doubleBooking.saveAnyway }).click();
    await expect
      .poll(async () =>
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/Amsterdam',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(new Date((await storedSession(page.request, w.base, first.id)).startsAt)),
      )
      .toBe('10:00');
  });
});
