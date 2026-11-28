import type { APIRequestContext } from '@playwright/test';
import {
  bookParticipant,
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  joinTeam,
  newAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';
import {
  blocks,
  columnOf,
  dragToColumn,
  GYM,
  inDays,
  seedClassDate,
  seedClient,
  seedKracht,
  seedKrachtClass,
  shift,
  storedSession,
  team,
  trainerChangeEmail,
  tuesday,
  wording,
} from './trainer-assignment-world';

// F024 (spec #461, tickets #553, #554, #1636): Substitute trainer on the web. CO-02 *Trainer
// vervangen* with *Alleen deze les* on CO-01, the calendar's quick view and by dragging to
// another trainer's column; the labels `⇄ Mike`, *Mike (vervangt Sarah)* and *vervanger* on the
// calendar, CO-01 and the quick view; the participants' email box. Copy comes from the catalogs.
// John owns John's Gym; Sarah, Tom and Mike are its Trainers (Tom stands for the spec's Lisa).
// Kracht is weekly on Tuesday 18:00 with Sarah; the second Tuesday is "20 October".

/** Substitutes `trainerId` on one date through the API, without any email. */
async function substitute(
  request: APIRequestContext,
  base: string,
  sessionId: string,
  trainerId: string,
) {
  const { version } = await storedSession(request, base, sessionId);
  const response = await request.post(`${base}/sessions/${sessionId}/trainer`, {
    data: {
      trainerId,
      version,
      scope: 'this',
      notifySubstitute: false,
      notifyParticipants: false,
    },
  });
  expect(response.status()).toBe(200);
}

test.describe('F024 Substitute trainer on the web', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  test('AC1: substitute from CO-01: Mike teaches 20 October alone, Sarah is remembered, the series and the participants stay', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const kracht = await seedKracht(page.request, w.base, w.trainer('Sarah'));
    const [first, second, third] = kracht.dates;
    if (!first || !second || !third) throw new Error('Kracht has fewer than three dates.');
    const anna = await seedClient(page.request, w.base, 'Anna de Vries');
    await bookParticipant(second, anna.id);
    await page.goto(`/w/${w.slug}/classes/${kracht.classId}/${second}`);

    await page.getByRole('button', { name: text.titleSubstitute }).click();
    const dialog = page.getByRole('dialog', { name: text.titleSubstitute });
    await expect(dialog.getByText(text.t('currently', { name: 'Sarah' }))).toBeVisible();
    await expect(dialog.getByText(text.t('whoSubstitute'))).toBeVisible();
    await expect(dialog.getByRole('radio', { name: text.t('scopeThis') })).toBeChecked();
    await expect(dialog.getByText(text.t('bookingsStay'))).toBeVisible();
    await dialog.getByRole('radio', { name: 'Mike', exact: true }).check();
    const emailMike = dialog.getByRole('checkbox', {
      name: text.t('notifySubstitute', { trainer: 'Mike' }),
    });
    await expect(emailMike).toBeChecked();
    await expectNoAxeViolations(page, `CO-02 Trainer vervangen in ${appLocale}`);
    await dialog.getByRole('button', { name: text.t('submitSubstitute') }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    const stored = await storedSession(page.request, w.base, second);
    await expect(
      page.getByRole('status').filter({
        hasText: text.t('doneSubstitute', {
          substitute: 'Mike',
          original: 'Sarah',
          date: text.day(stored.startsAt),
        }),
      }),
    ).toBeVisible();
    expect(stored.trainer?.name).toBe('Mike');
    expect(stored.substituteFor?.name).toBe('Sarah');
    expect(stored.participants?.map(({ clientId }) => clientId)).toEqual([anna.id]);
    for (const other of [first, third]) {
      const date = await storedSession(page.request, w.base, other);
      expect(date.trainer?.name).toBe('Sarah');
      expect(date.substituteFor).toBeUndefined();
    }
  });

  test('AC3: calendar labels, day column and legend: ⇄ Mike, "Mike (vervangt Sarah)" as name, tooltip, quick view and CO-01, Mike’s own column in the day view', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 1500 });
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const kracht = await seedKracht(page.request, w.base, w.trainer('Sarah'));
    const second = kracht.dates[1];
    if (!second) throw new Error('Kracht has fewer than two dates.');
    await substitute(page.request, w.base, second, w.trainer('Mike'));
    const date = shift(tuesday(), 7);
    const label = text.calendar('substituteLabel', { substitute: 'Mike', original: 'Sarah' });

    // The week: ⇄ and the substitute on the block, the accessible name and the tooltip say whom.
    await page.goto(`/w/${w.slug}/calendar?date=${date}&view=week`);
    const block = blocks(page).filter({ hasText: 'Mike' });
    await expect(block).toHaveCount(1);
    await expect(block).toContainText('⇄');
    await expect(block).toHaveAccessibleName(new RegExp(label.replace(/[()]/g, '\\$&')));
    await expect(block.getByTitle(label)).toBeVisible();
    // The legend lists vervanger.
    const legend = page.getByRole('list', { name: copy.myCalendar.legend });
    await expect(legend.getByText(text.calendar('legendSubstitute'))).toBeVisible();
    await expectNoAxeViolations(page, `the week with a substitution in ${appLocale}`);

    // The day view puts the block in Mike's column and not in Sarah's.
    await page.goto(`/w/${w.slug}/calendar?date=${date}&view=day`);
    const mike = await columnOf(page, 'Mike');
    await expect(mike.locator('button[aria-haspopup="dialog"]')).toContainText('⇄');
    await expect(
      (await columnOf(page, 'Sarah')).locator('button[aria-haspopup="dialog"]'),
    ).toHaveCount(0);

    // The list says it in words.
    await page.goto(`/w/${w.slug}/calendar?date=${date}&view=list`);
    await expect(page.getByRole('main').getByRole('table').getByText(label)).toBeVisible();

    // The quick view and CO-01.
    await page.goto(`/w/${w.slug}/calendar?date=${date}&view=week`);
    await blocks(page).filter({ hasText: 'Mike' }).click();
    const quick = page.getByRole('dialog');
    await expect(
      quick.getByText(text.calendar('trainerLine', { ...text.word, name: label })),
    ).toBeVisible();
    await expectNoAxeViolations(page, `the quick view of a substitution in ${appLocale}`);
    await quick.getByRole('link', { name: copy.workspaceCalendar.open }).click();
    await expect(page.getByRole('main').getByText(label)).toBeVisible();
    await expectNoAxeViolations(page, `CO-01 of a substitution in ${appLocale}`);
  });

  test('AC5: Tom replaces Mike and the date still says it replaces Sarah; choosing Sarah (vaste trainer) ends it', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const kracht = await seedKracht(page.request, w.base, w.trainer('Sarah'));
    const second = kracht.dates[1];
    if (!second) throw new Error('Kracht has fewer than two dates.');
    await substitute(page.request, w.base, second, w.trainer('Mike'));
    await page.goto(`/w/${w.slug}/classes/${kracht.classId}/${second}`);

    // The regular trainer comes first, marked.
    await page.getByRole('button', { name: text.titleSubstitute }).click();
    const dialog = page.getByRole('dialog', { name: text.titleSubstitute });
    await expect(dialog.getByText(text.t('currently', { name: 'Mike' }))).toBeVisible();
    await expect(dialog.getByRole('radio').first()).toHaveAccessibleName(
      text.t('regularTrainer', { ...text.word, name: 'Sarah' }),
    );
    await expectNoAxeViolations(page, `CO-02 on a substituted date in ${appLocale}`);
    // A third trainer keeps the original: "Tom vervangt Sarah".
    await dialog.getByRole('radio', { name: 'Tom', exact: true }).check();
    await dialog.getByRole('button', { name: text.t('submitSubstitute') }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const tom = await storedSession(page.request, w.base, second);
    await expect(
      page.getByRole('status').filter({
        hasText: text.t('doneSubstitute', {
          substitute: 'Tom',
          original: 'Sarah',
          date: text.day(tom.startsAt),
        }),
      }),
    ).toBeVisible();
    expect(tom.trainer?.name).toBe('Tom');
    expect(tom.substituteFor?.name).toBe('Sarah');

    // Choosing Sarah ends it: she teaches, the labels are gone (once the page shows Tom).
    await expect(
      page
        .getByRole('main')
        .getByText(text.calendar('substituteLabel', { substitute: 'Tom', original: 'Sarah' })),
    ).toBeVisible();
    await page.getByRole('button', { name: text.titleSubstitute }).click();
    const again = page.getByRole('dialog', { name: text.titleSubstitute });
    await again
      .getByRole('radio', { name: text.t('regularTrainer', { ...text.word, name: 'Sarah' }) })
      .check();
    await expect(again.getByRole('checkbox')).toHaveCount(0);
    await again.getByRole('button', { name: text.t('submitSubstitute') }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect
      .poll(async () => (await storedSession(page.request, w.base, second)).trainer?.name)
      .toBe('Sarah');
    expect((await storedSession(page.request, w.base, second)).substituteFor).toBeUndefined();
    await expect(
      page.getByRole('status').filter({
        hasText: text.t('doneClass', {
          trainer: 'Sarah',
          class: text.kracht,
          date: text.day(tom.startsAt),
        }),
      }),
    ).toBeVisible();
    await page.goto(`/w/${w.slug}/calendar?date=${shift(tuesday(), 7)}&view=week`);
    await expect(blocks(page).filter({ hasText: 'Sarah' })).toHaveCount(1);
    await expect(blocks(page).filter({ hasText: '⇄' })).toHaveCount(0);
  });

  test('AC7: drag to another trainer’s column opens CO-02 with Mike and Alleen deze les; Annuleren changes nothing', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 1500 });
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const kracht = await seedKracht(page.request, w.base, w.trainer('Sarah'));
    const [, second] = kracht.dates;
    if (!second) throw new Error('Kracht has fewer than two dates.');
    await page.goto(`/w/${w.slug}/calendar?date=${shift(tuesday(), 7)}&view=day`);

    await dragToColumn(
      page,
      blocks(page).filter({ hasText: text.kracht }),
      await columnOf(page, 'Mike'),
    );
    const dialog = page.getByRole('dialog', { name: text.titleSubstitute });
    await expect(dialog.getByRole('radio', { name: 'Mike', exact: true })).toBeChecked();
    await expect(dialog.getByRole('radio', { name: text.t('scopeThis') })).toBeChecked();
    await expectNoAxeViolations(page, `CO-02 opened by dragging in ${appLocale}`);
    await dialog.getByRole('button', { name: text.t('cancel') }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const stored = await storedSession(page.request, w.base, second);
    expect(stored.trainer?.name).toBe('Sarah');
    expect(stored.substituteFor).toBeUndefined();

    // Saving it from the drag is the substitution, and the block moves to Mike's column.
    await dragToColumn(
      page,
      blocks(page).filter({ hasText: text.kracht }),
      await columnOf(page, 'Mike'),
    );
    await page
      .getByRole('dialog', { name: text.titleSubstitute })
      .getByRole('button', { name: text.t('submitSubstitute') })
      .click();
    await expect
      .poll(async () => (await storedSession(page.request, w.base, second)).substituteFor?.name)
      .toBe('Sarah');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      (await columnOf(page, 'Mike')).locator('button[aria-haspopup="dialog"]'),
    ).toContainText('⇄');
  });

  test('AC8: a date that has started is substituted without the email boxes', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const classId = await seedKrachtClass(page.request, w.base, w.trainer('Sarah'));
    const past = await seedClassDate(page.request, w.base, classId, inDays(-3), w.trainer('Sarah'));
    const anna = await seedClient(page.request, w.base, 'Anna de Vries');
    await bookParticipant(past, anna.id);
    await page.goto(`/w/${w.slug}/classes/${classId}/${past}`);

    await page.getByRole('button', { name: text.titleSubstitute }).click();
    const dialog = page.getByRole('dialog', { name: text.titleSubstitute });
    await dialog.getByRole('radio', { name: 'Mike', exact: true }).check();
    // Neither the substitute's box nor the participants' box.
    await expect(dialog.getByRole('checkbox')).toHaveCount(0);
    await expectNoAxeViolations(page, `CO-02 on a date that has started in ${appLocale}`);
    await dialog.getByRole('button', { name: text.t('submitSubstitute') }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const stored = await storedSession(page.request, w.base, past);
    expect(stored.trainer?.name).toBe('Mike');
    expect(stored.substituteFor?.name).toBe('Sarah');
  });

  test('AC9: no other trainers: says so with Trainer uitnodigen', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const john = newAddress('john');
    const sarah = newAddress('sarah');
    await createAccount(john, undefined, 'John');
    await createAccount(sarah, undefined, 'Sarah');
    const slug = await createGymWithTrainer(john, GYM, 'owner', false);
    await joinTeam(sarah, slug, 'trainer');
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaces = (await (await page.request.get('/api/v1/me/workspaces')).json()) as {
      workspaceId: string;
      name: string;
    }[];
    const base = `/api/v1/workspaces/${workspaces.find((workspace) => workspace.name === GYM)?.workspaceId}`;
    const trainers = (await (await page.request.get(`${base}/trainers`)).json()) as {
      id: string;
      name: string;
    }[];
    const text = wording(appLocale, copy);
    const kracht = await seedKracht(page.request, base, trainers[0]?.id ?? '');
    const second = kracht.dates[1];
    if (!second) throw new Error('Kracht has fewer than two dates.');
    await page.goto(`/w/${slug}/classes/${kracht.classId}/${second}`);

    await page.getByRole('button', { name: text.titleSubstitute }).click();
    const dialog = page.getByRole('dialog', { name: text.titleSubstitute });
    await expect(
      dialog.getByText(text.t('noOthers', { ...text.word, workspace: GYM })),
    ).toBeVisible();
    await expect(
      dialog.getByRole('link', { name: text.t('inviteTrainer', { ...text.word }) }),
    ).toHaveAttribute('href', `/w/${slug}/trainers`);
    await expectNoAxeViolations(page, `CO-02 without other trainers in ${appLocale}`);
  });

  test('AC10: Trainer sees labels, no action: Sarah has no Trainer vervangen on CO-01 or in the quick view and cannot drag, and the label shows', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 1500 });
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const kracht = await seedKracht(page.request, w.base, w.trainer('Sarah'));
    const second = kracht.dates[1];
    if (!second) throw new Error('Kracht has fewer than two dates.');
    await substitute(page.request, w.base, second, w.trainer('Mike'));
    const label = text.calendar('substituteLabel', { substitute: 'Mike', original: 'Sarah' });
    await context.clearCookies();
    await signInWithSession(context, w.sarah);

    await page.goto(`/w/${w.slug}/classes/${kracht.classId}/${second}`);
    await expect(page.getByRole('main').getByText(label)).toBeVisible();
    await expect(page.getByRole('button', { name: text.titleSubstitute })).toHaveCount(0);

    await page.goto(`/w/${w.slug}/calendar?date=${shift(tuesday(), 7)}&view=day`);
    await expect(blocks(page).filter({ hasText: '⇄' })).toHaveCount(1);
    // No drag: dropping Mike's block on Sarah's column opens nothing.
    await dragToColumn(
      page,
      blocks(page).filter({ hasText: '⇄' }),
      await columnOf(page, copy.workspaceCalendar.you),
    );
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await blocks(page).filter({ hasText: '⇄' }).click();
    const quick = page.getByRole('dialog');
    await expect(
      quick.getByText(text.calendar('trainerLine', { ...text.word, name: label })),
    ).toBeVisible();
    await expect(quick.getByRole('link', { name: text.titleSubstitute })).toHaveCount(0);
    await expectNoAxeViolations(page, `a Trainer’s quick view of a substitution in ${appLocale}`);

    const refused = await page.request.post(`${w.base}/sessions/${second}/trainer`, {
      data: { trainerId: w.trainer('Tom'), version: 1, scope: 'this' },
    });
    expect(refused.status()).toBe(403);
  });

  test('AC16: CO-02 counts the participants: "2 deelnemers informeren per e-mail", on by default; unchecked saves notifyParticipants false', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const kracht = await seedKracht(page.request, w.base, w.trainer('Sarah'));
    const [, second, third] = kracht.dates;
    if (!second || !third) throw new Error('Kracht has fewer than three dates.');
    const anna = await seedClient(page.request, w.base, 'Anna de Vries', 'nl-NL');
    const mark = await seedClient(page.request, w.base, 'Mark Jansen', 'en');
    for (const date of [second, third]) {
      await bookParticipant(date, anna.id);
      await bookParticipant(date, mark.id);
    }

    // Both boxes checked: Anna and Mark are told, each by email, and neither names the other.
    await page.goto(`/w/${w.slug}/classes/${kracht.classId}/${second}`);
    await page.getByRole('button', { name: text.titleSubstitute }).click();
    const dialog = page.getByRole('dialog', { name: text.titleSubstitute });
    await dialog.getByRole('radio', { name: 'Mike', exact: true }).check();
    const participants = dialog.getByRole('checkbox', {
      name: text.t('notifyClass', { count: 2 }),
    });
    await expect(participants).toBeChecked();
    await expectNoAxeViolations(page, `CO-02 with participants in ${appLocale}`);
    const sent = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && request.url().endsWith(`/sessions/${second}/trainer`),
    );
    await dialog.getByRole('button', { name: text.t('submitSubstitute') }).click();
    expect((await sent).postDataJSON()).toMatchObject({
      scope: 'this',
      notifySubstitute: true,
      notifyParticipants: true,
    });
    const forAnna = await trainerChangeEmail(anna.email, 'Mike');
    const forMark = await trainerChangeEmail(mark.email, 'Mike');
    expect(forAnna.text).not.toContain('Mark');
    expect(forMark.text).not.toContain('Anna');

    // Unchecked, only the substitute's own box is sent as true.
    await page.goto(`/w/${w.slug}/classes/${kracht.classId}/${third}`);
    await page.getByRole('button', { name: text.titleSubstitute }).click();
    const again = page.getByRole('dialog', { name: text.titleSubstitute });
    await again.getByRole('radio', { name: 'Tom', exact: true }).check();
    await again.getByRole('checkbox', { name: text.t('notifyClass', { count: 2 }) }).uncheck();
    const silent = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && request.url().endsWith(`/sessions/${third}/trainer`),
    );
    await again.getByRole('button', { name: text.t('submitSubstitute') }).click();
    expect((await silent).postDataJSON()).toMatchObject({
      scope: 'this',
      notifySubstitute: true,
      notifyParticipants: false,
    });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await storedSession(page.request, w.base, third)).trainer?.name).toBe('Tom');
  });

  test('AC17: ending a substitution shows the participants’ box, on by default, and not the substitute’s', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const kracht = await seedKracht(page.request, w.base, w.trainer('Sarah'));
    const second = kracht.dates[1];
    if (!second) throw new Error('Kracht has fewer than two dates.');
    const anna = await seedClient(page.request, w.base, 'Anna de Vries', 'nl-NL');
    const mark = await seedClient(page.request, w.base, 'Mark Jansen', 'en');
    await bookParticipant(second, anna.id);
    await bookParticipant(second, mark.id);
    await substitute(page.request, w.base, second, w.trainer('Mike'));
    await page.goto(`/w/${w.slug}/classes/${kracht.classId}/${second}`);

    await page.getByRole('button', { name: text.titleSubstitute }).click();
    const dialog = page.getByRole('dialog', { name: text.titleSubstitute });
    await dialog
      .getByRole('radio', { name: text.t('regularTrainer', { ...text.word, name: 'Sarah' }) })
      .check();
    await expect(
      dialog.getByRole('checkbox', { name: text.t('notifyClass', { count: 2 }) }),
    ).toBeChecked();
    await expect(dialog.getByRole('checkbox')).toHaveCount(1);
    await expectNoAxeViolations(page, `CO-02 ending a substitution in ${appLocale}`);
    const sent = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && request.url().endsWith(`/sessions/${second}/trainer`),
    );
    await dialog.getByRole('button', { name: text.t('submitSubstitute') }).click();
    expect((await sent).postDataJSON()).toMatchObject({ scope: 'this', notifyParticipants: true });
    // Anna and Mark get the trainer-change email naming Sarah.
    await trainerChangeEmail(anna.email, 'Sarah');
    await trainerChangeEmail(mark.email, 'Sarah');
    await expect
      .poll(async () => (await storedSession(page.request, w.base, second)).trainer?.name)
      .toBe('Sarah');
    expect((await storedSession(page.request, w.base, second)).substituteFor).toBeUndefined();
  });
});
