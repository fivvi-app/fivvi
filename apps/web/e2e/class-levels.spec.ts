import type { APIRequestContext, Page } from '@playwright/test';
import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  joinTeam,
  newAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';

// F067 Class Levels (spec #587): the level on the class form, in *Les wijzigen* and on CO-01
// (#761). Copy comes from the catalogs. Each spec has accounts and workspaces of its own (see
// language.spec.ts): John owns John's Gym (and trains), Sarah is a Trainer there. Dates are
// relative to the day the spec runs.
const GYM = "John's Gym";

type Level = 'all_levels' | 'beginner' | 'intermediate' | 'advanced';

interface ClassBody {
  id: string;
  level?: Level;
}

interface SessionBody {
  id: string;
  version: number;
  level?: Level;
}

/** The `YYYY-MM-DD` of the first Tuesday at least three weeks ahead, plus `weeks` weeks. */
function tuesday(weeks = 0): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 21);
  day.setUTCDate(day.getUTCDate() + ((2 - day.getUTCDay() + 7) % 7) + weeks * 7);
  return day.toISOString().slice(0, 10);
}

test.describe('F067 class levels on the trainer web', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  /** John (Owner, trains) and Sarah (Trainer) of John's Gym. */
  async function team() {
    const john = newAddress('john');
    const sarah = newAddress('sarah');
    await createAccount(john, undefined, 'John');
    await createAccount(sarah, undefined, 'Sarah');
    const slug = await createGymWithTrainer(john, GYM, 'owner');
    await joinTeam(sarah, slug, 'trainer');
    return { john, sarah, slug };
  }

  async function gymId(request: APIRequestContext): Promise<string> {
    const workspaces = (await (await request.get('/api/v1/me/workspaces')).json()) as {
      workspaceId: string;
      name: string;
    }[];
    const id = workspaces.find((workspace) => workspace.name === GYM)?.workspaceId;
    if (!id) throw new Error(`No workspace ${GYM}.`);
    return id;
  }

  async function trainerId(request: APIRequestContext, workspaceId: string, name: string) {
    const trainers = (await (
      await request.get(`/api/v1/workspaces/${workspaceId}/trainers`)
    ).json()) as { id: string; name: string }[];
    const found = trainers.find((trainer) => trainer.name === name);
    if (!found) throw new Error(`No trainer ${name}.`);
    return found.id;
  }

  /** Makes a class through the API, as the data a spec starts from. */
  async function seedClass(
    request: APIRequestContext,
    workspaceId: string,
    data: Record<string, unknown>,
  ): Promise<ClassBody> {
    const response = await request.post(`/api/v1/workspaces/${workspaceId}/group-classes`, {
      data: { nameNl: 'Reformer Power', capacity: 8, durationMinutes: 60, ...data },
    });
    expect(response.status()).toBe(201);
    return ((await response.json()) as { groupClass: ClassBody }).groupClass;
  }

  async function seedDate(
    request: APIRequestContext,
    workspaceId: string,
    classId: string,
    data: Record<string, unknown> = {},
  ): Promise<SessionBody> {
    const response = await request.post(
      `/api/v1/workspaces/${workspaceId}/group-classes/${classId}/dates`,
      { data: { localDate: tuesday(), localStart: '18:00', ...data } },
    );
    expect(response.status()).toBe(201);
    return (await response.json()) as SessionBody;
  }

  async function storedDate(request: APIRequestContext, workspaceId: string, id: string) {
    return (await (
      await request.get(`/api/v1/workspaces/${workspaceId}/sessions/${id}`)
    ).json()) as SessionBody;
  }

  /** The accessible name of the level icon: "Niveau: Gevorderd" / "Level: Advanced". */
  const iconName = (copy: typeof import('@fivvi/i18n')['messages']['en'], word: string) =>
    copy.classLevel.accessibleName.replace('{level}', word);

  /** The three bars of the icon on `page`, filled or faint, in order. */
  function filledBars(page: Page) {
    return page
      .getByRole('main')
      .locator('[data-slot="level-icon"] i')
      .evaluateAll((bars) => bars.map((bar) => !bar.className.includes('opacity-30')));
  }

  test('AC1: John creates Reformer Power with Gevorderd on the class form and schedules it; CO-01 shows the icon and the word', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}/classes`);
    const workspaceId = await gymId(page.request);
    const word = copy.classLevel.advanced;

    await page.getByRole('button', { name: copy.classes.new, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: copy.classes.form.title });
    await expect(dialog).toBeVisible();
    // Niveau sits in De les, starts at Geen and lists the four levels in the viewer's language.
    const level = dialog.getByLabel(copy.classLevel.field, { exact: true });
    await expect(level).toHaveValue('');
    await expect(level.locator('option')).toHaveText([
      copy.classLevel.none,
      copy.classLevel.allLevels,
      copy.classLevel.beginner,
      copy.classLevel.intermediate,
      copy.classLevel.advanced,
    ]);
    await expectNoAxeViolations(page, `the class form with Niveau in ${appLocale}`);

    await dialog.getByLabel(copy.classes.form.nameNlLabel, { exact: true }).fill('Reformer Power');
    await dialog.getByLabel(copy.classes.form.capacityLabel, { exact: true }).fill('8');
    await level.selectOption({ label: word });
    await dialog.getByRole('button', { name: copy.classes.form.save }).click();
    await expect(
      page.getByRole('status').filter({ hasText: copy.classes.form.saved }),
    ).toBeVisible();

    // The data path: the class holds the level.
    const stored = (await (
      await page.request.get(`/api/v1/workspaces/${workspaceId}/group-classes`)
    ).json()) as (ClassBody & { nameNl: string })[];
    expect(stored).toMatchObject([{ nameNl: 'Reformer Power', level: 'advanced' }]);

    // Schedule it: the date takes the class's level.
    await page.goto(`/w/${slug}/classes/${stored[0]?.id}`);
    await page.getByRole('button', { name: copy.classes.page.schedule }).click();
    const schedule = page.getByRole('dialog', { name: copy.classes.schedule.title });
    await schedule.getByLabel(copy.classes.schedule.dateLabel, { exact: true }).fill(tuesday());
    await schedule.getByLabel(copy.classes.schedule.startLabel, { exact: true }).fill('18:00');
    await schedule.getByRole('button', { name: copy.classes.schedule.save }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${slug}/classes/[0-9a-f-]{36}/[0-9a-f-]{36}$`), {
      timeout: 15_000,
    });

    const main = page.getByRole('main');
    await expect(main.getByRole('img', { name: iconName(copy, word) })).toBeVisible();
    await expect(main.getByText(word, { exact: true })).toBeVisible();
    expect(await filledBars(page)).toEqual([true, true, true]);
    await expectNoAxeViolations(page, `CO-01 with Gevorderd in ${appLocale}`);
    const id = page.url().split('/').pop() ?? '';
    expect((await storedDate(page.request, workspaceId, id)).level).toBe('advanced');
  });

  test('AC3: John changes one date to Beginner in Les wijzigen; that date shows Beginner, the class and the other date keep Gevorderd', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const reformer = await seedClass(page.request, workspaceId, { level: 'advanced' });
    const first = await seedDate(page.request, workspaceId, reformer.id);
    const other = await seedDate(page.request, workspaceId, reformer.id, {
      localDate: tuesday(1),
    });
    const main = page.getByRole('main');

    await page.goto(`/w/${slug}/classes/${reformer.id}/${first.id}`);
    await expect(
      main.getByRole('img', { name: iconName(copy, copy.classLevel.advanced) }),
    ).toBeVisible();
    await page.getByRole('button', { name: copy.classes.date.edit }).click();
    const dialog = page.getByRole('dialog', { name: copy.classes.edit.title });
    const level = dialog.getByLabel(copy.classLevel.field, { exact: true });
    await expect(level).toHaveValue('advanced');
    await expectNoAxeViolations(page, `Les wijzigen with Niveau in ${appLocale}`);
    await level.selectOption({ label: copy.classLevel.beginner });
    await dialog.getByRole('button', { name: copy.classes.edit.save }).click();
    await expect(
      page.getByRole('status').filter({ hasText: copy.classes.edit.saved }),
    ).toBeVisible();

    // CO-01 of that date: Beginner, one bar filled.
    await expect(
      main.getByRole('img', { name: iconName(copy, copy.classLevel.beginner) }),
    ).toBeVisible();
    await expect(main.getByText(copy.classLevel.advanced, { exact: true })).toHaveCount(0);
    expect(await filledBars(page)).toEqual([true, false, false]);

    // The data path: only this date changed.
    expect((await storedDate(page.request, workspaceId, first.id)).level).toBe('beginner');
    expect((await storedDate(page.request, workspaceId, other.id)).level).toBe('advanced');
    expect(
      (await (
        await page.request.get(`/api/v1/workspaces/${workspaceId}/group-classes/${reformer.id}`)
      ).json()) as ClassBody,
    ).toMatchObject({ level: 'advanced' });

    // The other date's CO-01 keeps Gevorderd.
    await page.goto(`/w/${slug}/classes/${reformer.id}/${other.id}`);
    await expect(
      main.getByRole('img', { name: iconName(copy, copy.classLevel.advanced) }),
    ).toBeVisible();
  });

  test('AC3: changing Geen to a level and a level back to Geen in Les wijzigen', async ({
    page,
    context,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const reformer = await seedClass(page.request, workspaceId, {});
    const date = await seedDate(page.request, workspaceId, reformer.id);
    const main = page.getByRole('main');

    await page.goto(`/w/${slug}/classes/${reformer.id}/${date.id}`);
    await page.getByRole('button', { name: copy.classes.date.edit }).click();
    let dialog = page.getByRole('dialog', { name: copy.classes.edit.title });
    await expect(dialog.getByLabel(copy.classLevel.field, { exact: true })).toHaveValue('');
    await dialog
      .getByLabel(copy.classLevel.field, { exact: true })
      .selectOption({ label: copy.classLevel.intermediate });
    await dialog.getByRole('button', { name: copy.classes.edit.save }).click();
    await expect(dialog).toBeHidden();
    await expect(
      main.getByRole('img', { name: iconName(copy, copy.classLevel.intermediate) }),
    ).toBeVisible();
    expect(await filledBars(page)).toEqual([true, true, false]);

    await page.getByRole('button', { name: copy.classes.date.edit }).click();
    dialog = page.getByRole('dialog', { name: copy.classes.edit.title });
    await dialog
      .getByLabel(copy.classLevel.field, { exact: true })
      .selectOption({ label: copy.classLevel.none });
    await dialog.getByRole('button', { name: copy.classes.edit.save }).click();
    // The page behind the dialog is hidden from the role query until it closes.
    await expect(dialog).toBeHidden();
    await expect(main.locator('[data-slot="level-icon"]')).toHaveCount(0);
    expect((await storedDate(page.request, workspaceId, date.id)).level).toBeUndefined();
  });

  test('AC7: CO-01 shows the icon and the word for each level; with Geen nothing shows and no empty line remains', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const reformer = await seedClass(page.request, workspaceId, {});
    const levels = [
      ['all_levels', copy.classLevel.allLevels, [true, true, true]],
      ['beginner', copy.classLevel.beginner, [true, false, false]],
      ['intermediate', copy.classLevel.intermediate, [true, true, false]],
      ['advanced', copy.classLevel.advanced, [true, true, true]],
    ] as const;
    const main = page.getByRole('main');

    for (const [index, [level, word, bars]] of levels.entries()) {
      const date = await seedDate(page.request, workspaceId, reformer.id, {
        localDate: tuesday(index),
        level,
      });
      await page.goto(`/w/${slug}/classes/${reformer.id}/${date.id}`);
      await expect(main.getByRole('img', { name: iconName(copy, word) })).toBeVisible();
      await expect(main.getByText(word, { exact: true })).toBeVisible();
      await expect(main.getByText(copy.classLevel.field, { exact: true })).toBeVisible();
      expect(await filledBars(page), level).toEqual(bars);
      await expectNoAxeViolations(page, `CO-01 with ${level} in ${appLocale}`);
    }

    const geen = await seedDate(page.request, workspaceId, reformer.id, {
      localDate: tuesday(levels.length),
    });
    await page.goto(`/w/${slug}/classes/${reformer.id}/${geen.id}`);
    await expect(main.getByText('18:00–19:00')).toBeVisible();
    await expect(main.locator('[data-slot="level-icon"]')).toHaveCount(0);
    await expect(main.getByText(copy.classLevel.field, { exact: true })).toHaveCount(0);
    for (const [, word] of levels)
      await expect(main.getByText(word, { exact: true })).toHaveCount(0);
    await expectNoAxeViolations(page, `CO-01 with Geen in ${appLocale}`);
  });

  test('AC8: Sarah (Trainer) sees the level on CO-01 and has no way to change it', async ({
    page,
    context,
    browser,
    appLocale,
    messages: copy,
  }) => {
    const { john, sarah, slug } = await team();
    const owner = await browser.newContext({ extraHTTPHeaders: clientIpHeaders() });
    await signInWithSession(owner, john);
    await owner.request.get('/api/v1/me/workspaces');
    const workspaceId = await gymId(owner.request);
    const reformer = await seedClass(owner.request, workspaceId, {
      level: 'advanced',
      trainerId: await trainerId(owner.request, workspaceId, 'Sarah'),
    });
    const date = await seedDate(owner.request, workspaceId, reformer.id);
    await owner.close();

    await signInWithSession(context, sarah);
    await page.goto(`/w/${slug}/classes/${reformer.id}/${date.id}`);
    const main = page.getByRole('main');
    await expect(
      main.getByRole('img', { name: iconName(copy, copy.classLevel.advanced) }),
    ).toBeVisible();
    await expect(main.getByText(copy.classLevel.advanced, { exact: true })).toBeVisible();
    await expect(main.getByRole('combobox')).toHaveCount(0);
    await expect(main.getByRole('button', { name: copy.classes.date.edit })).toHaveCount(0);
    await expectNoAxeViolations(page, `CO-01 with a level as a Trainer in ${appLocale}`);

    // The route says no.
    const refused = await page.request.patch(
      `/api/v1/workspaces/${workspaceId}/sessions/${date.id}`,
      { data: { version: 1, level: 'beginner' } },
    );
    expect(refused.status()).toBe(403);
    expect((await storedDate(page.request, workspaceId, date.id)).level).toBe('advanced');
  });

  /** A day of the spec's week: `tuesday()` plus `days`. */
  const dayOfWeek = (days: number) =>
    new Date(Date.parse(`${tuesday()}T12:00:00Z`) + days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

  /** The levels of the Agenda's week, one class date each (all on a different day), and Geen. */
  const AGENDA = [
    ['Yoga Alle', 'all_levels'],
    ['Yoga Beginner', 'beginner'],
    ['Yoga Gemiddeld', 'intermediate'],
    ['Yoga Gevorderd', 'advanced'],
    ['Yoga Geen', undefined],
  ] as const;

  /** Seeds a class date per level in the week of `tuesday()`, taught by Sarah; as John, on `request`. */
  async function seedAgenda(request: APIRequestContext, workspaceId: string) {
    const sarah = await trainerId(request, workspaceId, 'Sarah');
    for (const [index, [name, level]] of AGENDA.entries()) {
      const groupClass = await seedClass(request, workspaceId, {
        nameNl: name,
        trainerId: sarah,
        ...(level ? { level } : {}),
      });
      await seedDate(request, workspaceId, groupClass.id, { localDate: dayOfWeek(index) });
    }
  }

  /** The blocks of the Agenda: each opens the quick view (WC-05). */
  const block = (page: Page, name: string) =>
    page.getByRole('main').locator('button[aria-haspopup="dialog"]').filter({ hasText: name });

  test('AC7: the Agenda’s session sheet shows the icon and the word for each level, and with Geen nothing and no empty line', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    await seedAgenda(page.request, await gymId(page.request));
    await page.goto(`/w/${slug}/calendar?date=${tuesday()}&view=week`);
    const sheet = page.getByRole('dialog');
    const words = {
      all_levels: copy.classLevel.allLevels,
      beginner: copy.classLevel.beginner,
      intermediate: copy.classLevel.intermediate,
      advanced: copy.classLevel.advanced,
    } as const;

    for (const [name, level] of AGENDA) {
      await block(page, name).click();
      await expect(sheet).toContainText(name);
      if (level) {
        const word = words[level];
        await expect(sheet.getByRole('img', { name: iconName(copy, word) })).toBeVisible();
        await expect(sheet.getByText(word, { exact: true })).toBeVisible();
        expect(
          await sheet
            .locator('[data-slot="level-icon"] i')
            .evaluateAll((bars) => bars.map((bar) => !bar.className.includes('opacity-30'))),
        ).toEqual(
          level === 'beginner'
            ? [true, false, false]
            : level === 'intermediate'
              ? [true, true, false]
              : [true, true, true],
        );
        await expectNoAxeViolations(page, `the session sheet with ${level} in ${appLocale}`);
      } else {
        await expect(sheet.locator('[data-slot="level-icon"]')).toHaveCount(0);
        for (const word of Object.values(words)) {
          await expect(sheet.getByText(word, { exact: true })).toHaveCount(0);
        }
        // No empty line: every line of the sheet's list has text.
        const lines = await sheet.locator('ul > li').allInnerTexts();
        expect(lines.every((line) => line.trim() !== '')).toBe(true);
        await expectNoAxeViolations(page, `the session sheet with Geen in ${appLocale}`);
      }
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
    }
  });

  test('AC8: Sarah (Trainer) sees the same level on the sheet and has no control to change it', async ({
    page,
    context,
    browser,
    appLocale,
    messages: copy,
  }) => {
    const { john, sarah, slug } = await team();
    const owner = await browser.newContext({ extraHTTPHeaders: clientIpHeaders() });
    await signInWithSession(owner, john);
    await owner.request.get('/api/v1/me/workspaces');
    await seedAgenda(owner.request, await gymId(owner.request));
    await owner.close();

    await signInWithSession(context, sarah);
    await page.goto(`/w/${slug}/calendar?date=${tuesday()}&view=week`);
    await block(page, 'Yoga Gevorderd').click();
    const sheet = page.getByRole('dialog');
    await expect(
      sheet.getByRole('img', { name: iconName(copy, copy.classLevel.advanced) }),
    ).toBeVisible();
    await expect(sheet.getByText(copy.classLevel.advanced, { exact: true })).toBeVisible();
    await expect(sheet.getByRole('combobox')).toHaveCount(0);
    await expect(sheet.getByRole('link', { name: copy.workspaceCalendar.change })).toHaveCount(0);
    await expectNoAxeViolations(page, `the session sheet as a Trainer in ${appLocale}`);
  });
});
