import type { APIRequestContext } from '@playwright/test';
import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  joinTeam,
  newAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';

// F022 (spec #428, ticket #454): *Herhalen* when scheduling a class, *Reeksen* on the class page,
// the series line and what differs on CO-01, *Wijzigen voor* on CO-04 and *Reeks wijzigen* (#1523). Copy comes from the
// catalogs. John owns John's Gym and trains there, Sarah is a Trainer. Dates are relative to the
// day the spec runs.
const GYM = "John's Gym";
const DAY = 24 * 60 * 60 * 1000;
const PHONE = { width: 390, height: 844 };

interface SessionBody {
  id: string;
  version: number;
  startsAt: string;
  capacity: number;
  series?: { changedFields: string[]; weekday: string; localStartTime: string };
}

const isoDay = (instant: number) => new Date(instant).toISOString().slice(0, 10);

/** The `YYYY-MM-DD` of the first Tuesday at least three weeks ahead. */
function tuesday(): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 21);
  day.setUTCDate(day.getUTCDate() + ((2 - day.getUTCDay() + 7) % 7));
  return day.toISOString().slice(0, 10);
}

/** The wall-clock `HH:mm` of `instant` in Amsterdam. */
const clockOf = (instant: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));

/**
 * A Sunday two weeks before the next last Sunday of March, ahead of today: a weekly class at 02:30
 * from there reaches the hour the clocks skip within its 12 weeks.
 */
function sundayBeforeSpringForward(): { start: string; skipped: string } {
  for (let year = new Date().getUTCFullYear(); ; year += 1) {
    const lastOfMarch = Date.UTC(year, 2, 31);
    const skipped = lastOfMarch - new Date(lastOfMarch).getUTCDay() * DAY;
    if (skipped - 14 * DAY > Date.now() + DAY) {
      return { start: isoDay(skipped - 14 * DAY), skipped: isoDay(skipped) };
    }
  }
}

test.describe('F022 weekly classes on the web', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

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

  async function johnsId(request: APIRequestContext, workspaceId: string) {
    const trainers = (await (
      await request.get(`/api/v1/workspaces/${workspaceId}/trainers`)
    ).json()) as { id: string; name: string }[];
    const found = trainers.find((trainer) => trainer.name === 'John');
    if (!found) throw new Error('No trainer John.');
    return found.id;
  }

  /** "Kracht" (Strength), John teaching, 8 spots, 60 minutes: the class a spec starts from. */
  async function seedClass(request: APIRequestContext, workspaceId: string) {
    const response = await request.post(`/api/v1/workspaces/${workspaceId}/group-classes`, {
      data: {
        nameNl: 'Kracht',
        nameEn: 'Strength',
        capacity: 8,
        durationMinutes: 60,
        trainerId: await johnsId(request, workspaceId),
      },
    });
    expect(response.status()).toBe(201);
    return ((await response.json()) as { groupClass: { id: string } }).groupClass;
  }

  /** The weekly series from `tuesday()`, as the data a spec starts from; its first dates, soonest first. */
  async function seedSeries(request: APIRequestContext, workspaceId: string, classId: string) {
    const created = await request.post(
      `/api/v1/workspaces/${workspaceId}/group-classes/${classId}/dates`,
      { data: { localDate: tuesday(), localStart: '18:00', repeat: 'weekly' } },
    );
    expect(created.status()).toBe(201);
    return datesFrom(request, workspaceId, tuesday(), 27);
  }

  /** The dates John teaches from `from` for `days` days. */
  async function datesFrom(
    request: APIRequestContext,
    workspaceId: string,
    from: string,
    days: number,
  ): Promise<SessionBody[]> {
    const to = isoDay(Date.parse(`${from}T12:00:00Z`) + days * DAY);
    const { items } = (await (
      await request.get(`/api/v1/me/sessions?from=${from}&to=${to}`)
    ).json()) as {
      items: { sessionId: string; workspace: { id: string } }[];
    };
    return Promise.all(
      items
        .filter((item) => item.workspace.id === workspaceId)
        .map(
          async (item) =>
            (await (
              await request.get(`/api/v1/workspaces/${workspaceId}/sessions/${item.sessionId}`)
            ).json()) as SessionBody,
        ),
    );
  }

  test('AC1: scheduling with Herhalen shows the note and "12 groepslessen toegevoegd", and the series shows on CO-01 and the class page', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const kracht = await seedClass(page.request, workspaceId);
    const weekday = appLocale === 'en' ? 'Tuesday' : 'dinsdag';
    const name = appLocale === 'en' ? 'Strength' : 'Kracht';

    await page.goto(`/w/${slug}/classes/${kracht.id}`);
    await expect(page.getByText(copy.classes.series.title, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: copy.classes.page.schedule }).click();
    const dialog = page.getByRole('dialog', { name: copy.classes.schedule.title });
    await dialog.getByLabel(copy.classes.schedule.dateLabel, { exact: true }).fill(tuesday());
    await dialog.getByLabel(copy.classes.schedule.startLabel, { exact: true }).fill('18:00');
    const repeat = dialog.getByLabel(copy.classes.schedule.repeatLabel, { exact: true });
    // The default is not repeating; the weekly option names the weekday of the chosen date.
    await expect(repeat).toHaveValue('none');
    await expect(dialog.getByText(copy.classes.schedule.repeatNote)).toHaveCount(0);
    await repeat.selectOption({
      label: copy.classes.schedule.repeatWeekly.replace('{weekday}', weekday),
    });
    await expect(dialog.getByText(copy.classes.schedule.repeatNote)).toBeVisible();
    await expectNoAxeViolations(page, `the schedule form with Herhalen in ${appLocale}`);
    await dialog.getByRole('button', { name: copy.classes.schedule.save }).click();

    await expect(page).toHaveURL(new RegExp(`/w/${slug}/classes/${kracht.id}/[0-9a-f-]{36}$`), {
      timeout: 15_000,
    });
    await expect(
      page.getByRole('status').filter({
        hasText: appLocale === 'en' ? '12 group classes added' : '12 groepslessen toegevoegd',
      }),
    ).toBeVisible();
    // CO-01 of the first date: the series line, and no difference with it.
    const main = page.getByRole('main');
    await expect(
      main.getByText(
        copy.classes.date.seriesLine
          .replace('{name}', name)
          .replace('{weekday}', weekday)
          .replace('{time}', '18:00'),
      ),
    ).toBeVisible();
    await expect(
      main.getByText(copy.classes.date.changedFromSeries.split('{')[0] ?? ''),
    ).toHaveCount(0);
    await expectNoAxeViolations(page, `CO-01 in a series in ${appLocale}`);

    // The class page: Reeksen with the series, from its first date.
    await page.goto(`/w/${slug}/classes/${kracht.id}`);
    await expect(page.getByRole('heading', { name: copy.classes.series.title })).toBeVisible();
    await expect(
      page.getByText(
        copy.classes.series.line
          .replace('{weekday}', weekday)
          .replace('{start}', '18:00')
          .replace('{end}', '19:00')
          .replace('{trainer}', 'John')
          .replace('{spots}', appLocale === 'en' ? '8 spots' : '8 plekken'),
      ),
    ).toBeVisible();
    await expectNoAxeViolations(page, `the class page with Reeksen in ${appLocale}`);

    // The data path: one weekly series of the class, and its dates every week at 18:00.
    const series = (await (
      await page.request.get(`/api/v1/workspaces/${workspaceId}/group-classes/${kracht.id}/series`)
    ).json()) as { rrule: string; localStartTime: string; startsOn: string }[];
    expect(series).toMatchObject([
      { rrule: 'FREQ=WEEKLY;BYDAY=TU', localStartTime: '18:00', startsOn: tuesday() },
    ]);
    const dates = await datesFrom(page.request, workspaceId, tuesday(), 41);
    expect(dates).toHaveLength(6);
    expect(dates.map(({ startsAt }) => clockOf(startsAt))).toEqual(Array(6).fill('18:00'));
  });

  test('AC4: Alleen deze les moves one date and CO-01 says "Aangepast t.o.v. de reeks: tijd"', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const kracht = await seedClass(page.request, workspaceId);
    const [first, second, third] = await seedSeries(page.request, workspaceId, kracht.id);
    if (!first || !second || !third) throw new Error('The series has fewer than three dates.');

    await page.goto(`/w/${slug}/classes/${kracht.id}/${second.id}`);
    await page.getByRole('button', { name: copy.classes.date.edit }).click();
    const dialog = page.getByRole('dialog', { name: copy.classes.edit.title });
    // Wijzigen voor: Alleen deze les is the default.
    await expect(dialog.getByText(copy.classes.edit.scopeLabel)).toBeVisible();
    await expect(dialog.getByRole('radio', { name: copy.classes.edit.scopeThis })).toBeChecked();
    await expect(
      dialog.getByRole('radio', { name: copy.classes.edit.scopeFollowing }),
    ).not.toBeChecked();
    await dialog.getByLabel(copy.classes.edit.startLabel, { exact: true }).fill('18:30');
    await dialog.getByLabel(copy.classes.edit.endLabel, { exact: true }).fill('19:30');
    await dialog.getByRole('button', { name: copy.classes.edit.save }).click();
    await expect(
      page.getByRole('status').filter({ hasText: copy.classes.edit.saved }),
    ).toBeVisible();

    const field = copy.classes.date.changedField.time;
    await expect(
      page
        .getByRole('main')
        .getByText(copy.classes.date.changedFromSeries.replace('{fields}', field)),
    ).toBeVisible();
    await expectNoAxeViolations(page, `CO-01 changed from its series in ${appLocale}`);

    // The data path: only this date moved; the others are as before.
    const stored = await datesFrom(page.request, workspaceId, tuesday(), 27);
    expect(stored.map(({ startsAt }) => clockOf(startsAt))).toEqual([
      '18:00',
      '18:30',
      '18:00',
      '18:00',
    ]);
    expect(stored[1]?.series?.changedFields).toEqual(['time']);
    expect(stored[0]?.series?.changedFields).toEqual([]);
    expect(stored[2]?.series?.changedFields).toEqual([]);
  });

  test('AC5: Deze en volgende lessen changes the series from the date on, and the date with its own changes stays', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const kracht = await seedClass(page.request, workspaceId);
    const [first, second, third] = await seedSeries(page.request, workspaceId, kracht.id);
    if (!first || !second || !third) throw new Error('The series has fewer than three dates.');
    // The second date was changed on its own: capacity 6.
    const own = await page.request.patch(
      `/api/v1/workspaces/${workspaceId}/sessions/${second.id}`,
      { data: { version: second.version, capacity: 6 } },
    );
    expect(own.status()).toBe(200);

    await page.goto(`/w/${slug}/classes/${kracht.id}/${first.id}`);
    await page.getByRole('button', { name: copy.classes.date.edit }).click();
    const dialog = page.getByRole('dialog', { name: copy.classes.edit.title });
    await dialog.getByRole('radio', { name: copy.classes.edit.scopeFollowing }).check();
    await expect(
      dialog.getByRole('radio', { name: copy.classes.edit.scopeFollowing }),
    ).toBeChecked();
    await dialog.getByLabel(copy.classes.edit.capacityLabel, { exact: true }).fill('10');
    await expectNoAxeViolations(page, `CO-04 with Wijzigen voor in ${appLocale}`);
    await dialog.getByRole('button', { name: copy.classes.edit.save }).click();

    // Saved: the count of dates that kept their own changes.
    const toast = page.getByRole('status').filter({ hasText: copy.classes.edit.saved });
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(
      appLocale === 'en'
        ? '1 class has its own changes and stays as it is.'
        : '1 les heeft eigen wijzigingen en blijft zoals hij is.',
    );

    // The data path: capacity 10 from here on, except the date with its own changes (6).
    const stored = await datesFrom(page.request, workspaceId, tuesday(), 27);
    expect(stored.map(({ capacity }) => capacity)).toEqual([10, 6, 10, 10]);
  });

  test('series edit: John changes the time of the Kracht series to 19:00; upcoming dates follow, a date with its own changes keeps them', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const kracht = await seedClass(page.request, workspaceId);
    const [first, second] = await seedSeries(page.request, workspaceId, kracht.id);
    if (!first || !second) throw new Error('The series has fewer than two dates.');
    // The second date was changed on its own: capacity 6.
    expect(
      (
        await page.request.patch(`/api/v1/workspaces/${workspaceId}/sessions/${second.id}`, {
          data: { version: second.version, capacity: 6 },
        })
      ).status(),
    ).toBe(200);

    for (const viewport of [{ width: 1280, height: 800 }, PHONE]) {
      await page.setViewportSize(viewport);
      await page.goto(`/w/${slug}/classes/${kracht.id}`);
      await page.getByRole('button', { name: copy.classes.series.edit }).click();
      const dialog = page.getByRole('dialog', { name: copy.classes.series.dialog.title });
      await expect(dialog.getByText(copy.classes.series.dialog.description)).toBeVisible();
      // The form starts from the series as it runs.
      await expect(
        dialog.getByLabel(copy.classes.series.dialog.startLabel, { exact: true }),
      ).toHaveValue('18:00');
      await expect(
        dialog.getByLabel(copy.classes.series.dialog.endLabel, { exact: true }),
      ).toHaveValue('19:00');
      await expect(
        dialog.getByLabel(copy.classes.series.dialog.capacityLabel, { exact: true }),
      ).toHaveValue('8');
      await expectNoAxeViolations(page, `Reeks wijzigen in ${appLocale} at ${viewport.width}px`);
      // Nothing is saved on Annuleren.
      await dialog.getByRole('button', { name: copy.classes.series.dialog.cancel }).click();
      await expect(dialog).toHaveCount(0);
    }

    // A capacity outside 1 to 100 is worded under the field, and nothing is sent.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/w/${slug}/classes/${kracht.id}`);
    await page.getByRole('button', { name: copy.classes.series.edit }).click();
    const dialog = page.getByRole('dialog', { name: copy.classes.series.dialog.title });
    await dialog.getByLabel(copy.classes.series.dialog.capacityLabel, { exact: true }).fill('0');
    await dialog.getByRole('button', { name: copy.classes.series.dialog.save }).click();
    await expect(
      dialog.getByText(
        copy.classes.series.dialog.errors.capacityInvalid
          .replace('{min}', '1')
          .replace('{max}', '100'),
      ),
    ).toBeVisible();
    await expectNoAxeViolations(page, `Reeks wijzigen with a refusal in ${appLocale}`);

    // The time to 19:00 (the end moves with it), saved.
    await dialog.getByLabel(copy.classes.series.dialog.capacityLabel, { exact: true }).fill('8');
    await dialog.getByLabel(copy.classes.series.dialog.startLabel, { exact: true }).fill('19:00');
    await dialog.getByLabel(copy.classes.series.dialog.endLabel, { exact: true }).fill('20:00');
    await dialog.getByRole('button', { name: copy.classes.series.dialog.save }).click();

    const toast = page.getByRole('status').filter({ hasText: copy.classes.series.dialog.saved });
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(
      appLocale === 'en'
        ? '1 class has its own changes and stays as it is.'
        : '1 les heeft eigen wijzigingen en blijft zoals hij is.',
    );
    // The card shows the new values.
    await expect(
      page.getByText(
        copy.classes.series.line
          .replace('{weekday}', appLocale === 'en' ? 'Tuesday' : 'dinsdag')
          .replace('{start}', '19:00')
          .replace('{end}', '20:00')
          .replace('{trainer}', 'John')
          .replace('{spots}', appLocale === 'en' ? '8 spots' : '8 plekken'),
      ),
    ).toBeVisible();

    // The data path: every upcoming date without its own changes is at 19:00; the date with its
    // own changes stays as it is (18:00, capacity 6).
    const stored = await datesFrom(page.request, workspaceId, tuesday(), 27);
    expect(stored.map(({ startsAt }) => clockOf(startsAt))).toEqual([
      '19:00',
      '18:00',
      '19:00',
      '19:00',
    ]);
    expect(stored.map(({ capacity }) => capacity)).toEqual([8, 6, 8, 8]);
  });

  test('AC7: a weekly time in the hour the clocks skip shows the message and creates nothing', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const kracht = await seedClass(page.request, workspaceId);
    const { start, skipped } = sundayBeforeSpringForward();

    await page.goto(`/w/${slug}/classes/${kracht.id}`);
    await page.getByRole('button', { name: copy.classes.page.schedule }).click();
    const dialog = page.getByRole('dialog', { name: copy.classes.schedule.title });
    await dialog.getByLabel(copy.classes.schedule.dateLabel, { exact: true }).fill(start);
    await dialog.getByLabel(copy.classes.schedule.startLabel, { exact: true }).fill('02:30');
    await dialog
      .getByLabel(copy.classes.schedule.repeatLabel, { exact: true })
      .selectOption('weekly');
    await dialog.getByRole('button', { name: copy.classes.schedule.save }).click();

    // The message names the date that does not have 02:30, not the one the person typed.
    const written = new Intl.DateTimeFormat(appLocale === 'en' ? 'en-GB' : 'nl-NL', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${skipped}T12:00:00Z`));
    await expect(
      dialog.getByText(copy.classes.schedule.errors.timeDoesNotExist.replace('{date}', written)),
    ).toBeVisible();
    await expectNoAxeViolations(page, `the schedule form with the DST message in ${appLocale}`);

    // Nothing was created: no series, no dates.
    expect(
      await (
        await page.request.get(
          `/api/v1/workspaces/${workspaceId}/group-classes/${kracht.id}/series`,
        )
      ).json(),
    ).toEqual([]);
    expect(await datesFrom(page.request, workspaceId, start, 41)).toEqual([]);
  });

  test('AC8: Sarah sees the series line and no Herhalen, no Wijzigen, no Reeksen', async ({
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
    const kracht = await seedClass(owner.request, workspaceId);
    const [, second] = await seedSeries(owner.request, workspaceId, kracht.id);
    if (!second) throw new Error('The series has fewer than two dates.');
    // The second date differs from its series: the capacity.
    expect(
      (
        await owner.request.patch(`/api/v1/workspaces/${workspaceId}/sessions/${second.id}`, {
          data: { version: second.version, capacity: 6 },
        })
      ).status(),
    ).toBe(200);
    await owner.close();

    await signInWithSession(context, sarah);
    await page.goto(`/w/${slug}/classes/${kracht.id}/${second.id}`);
    const main = page.getByRole('main');
    const weekday = appLocale === 'en' ? 'Tuesday' : 'dinsdag';
    await expect(
      main.getByText(
        copy.classes.date.seriesLine
          .replace('{name}', appLocale === 'en' ? 'Strength' : 'Kracht')
          .replace('{weekday}', weekday)
          .replace('{time}', '18:00'),
      ),
    ).toBeVisible();
    await expect(
      main.getByText(
        copy.classes.date.changedFromSeries.replace(
          '{fields}',
          copy.classes.date.changedField.capacity,
        ),
      ),
    ).toBeVisible();
    await expect(main.getByRole('button', { name: copy.classes.date.edit })).toHaveCount(0);
    await expect(main.getByText(copy.classes.series.title, { exact: true })).toHaveCount(0);
    await expect(main.getByRole('button', { name: copy.classes.series.edit })).toHaveCount(0);
    await expectNoAxeViolations(page, `CO-01 in a series as a Trainer in ${appLocale}`);

    // No class page for her (so no Reeksen, no Herhalen), and the series route answers 403.
    await page.goto(`/w/${slug}/classes/${kracht.id}`);
    await expect(
      page.getByRole('heading', { level: 1, name: copy.noPermission.title }),
    ).toBeVisible();
    await expect(page.getByText(copy.classes.series.title, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: copy.classes.series.edit })).toHaveCount(0);
    expect(
      (
        await page.request.get(
          `/api/v1/workspaces/${workspaceId}/group-classes/${kracht.id}/series`,
        )
      ).status(),
    ).toBe(403);
  });
});
