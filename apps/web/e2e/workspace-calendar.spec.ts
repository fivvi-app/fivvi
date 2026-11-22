import { type Locale, type Messages, trainerWordForms } from '@fivvi/i18n';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  cancelSession,
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  joinTeam,
  newAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';

// F014 (spec #458, ticket #529): the Agenda of a workspace on the web, week, day and list, the
// filters and the quick view. Copy comes from the catalogs. John owns John's Gym and trains
// there, Sarah and Tom are its Trainers. The week is the one of the spec, a few weeks ahead of the
// day the spec runs (the API plans no date in the past): Mark with Sarah on Tuesday 07:00, the
// class Kracht on Tuesday 10:00 with Sarah (capacity 8, weekly), Lisa with Tom at 11:00, a
// cancelled Kracht at 18:00 and, on Thursday at 19:15, Boxing without a trainer.
const GYM = "John's Gym";
const DAY = 24 * 60 * 60 * 1000;
const isoDay = (instant: number) => new Date(instant).toISOString().slice(0, 10);

/** The `YYYY-MM-DD` of the first Tuesday at least three weeks ahead. */
function tuesday(): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 21);
  day.setUTCDate(day.getUTCDate() + ((2 - day.getUTCDay() + 7) % 7));
  return day.toISOString().slice(0, 10);
}

/** The last Sunday of October that is at least a week ahead: the day the clocks go back. */
function clocksBack(): string {
  for (let year = new Date().getUTCFullYear(); ; year += 1) {
    const lastOfOctober = Date.UTC(year, 9, 31);
    const sunday = lastOfOctober - new Date(lastOfOctober).getUTCDay() * DAY;
    if (sunday > Date.now() + 7 * DAY) return isoDay(sunday);
  }
}

/** The messages of the calendar with the workspace's word for the people who teach filled in (F068). */
function wording(calendar: Messages['workspaceCalendar'], locale: Locale) {
  const fill = (message: string) =>
    Object.entries(trainerWordForms('trainer', locale)).reduce(
      (text, [name, word]) => text.replaceAll(`{${name}}`, word),
      message,
    );
  return {
    ...calendar,
    noTrainer: fill(calendar.noTrainer),
    noTrainerMark: fill(calendar.noTrainerMark),
    columnTrainer: fill(calendar.columnTrainer),
    trainerLine: fill(calendar.trainerLine),
  };
}

const shift = (date: string, days: number) => isoDay(Date.parse(`${date}T12:00:00Z`) + days * DAY);

interface Week {
  john: string;
  sarah: string;
  tom: string;
  slug: string;
  workspaceId: string;
  sessions: Record<'mark' | 'lisa' | 'kracht' | 'krachtCancelled' | 'boxing', string>;
  date: string;
}

test.describe('F014 Agenda on the web', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  async function created(request: APIRequestContext, url: string, data: unknown) {
    const response = await request.post(url, { data });
    expect(response.status(), url).toBe(201);
    return response.json();
  }

  /** The team, signed in as John, and the week of the spec planned through the API as the Owner does. */
  async function seed(page: Page, context: Parameters<typeof signInWithSession>[0]): Promise<Week> {
    const [john, sarah, tom] = [newAddress('john'), newAddress('sarah'), newAddress('tom')];
    await createAccount(john, undefined, 'John');
    await createAccount(sarah, undefined, 'Sarah');
    await createAccount(tom, undefined, 'Tom');
    const slug = await createGymWithTrainer(john, GYM, 'owner');
    await joinTeam(sarah, slug, 'trainer');
    await joinTeam(tom, slug, 'trainer');
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaces = (await (await page.request.get('/api/v1/me/workspaces')).json()) as {
      workspaceId: string;
      name: string;
    }[];
    const workspaceId = workspaces.find((workspace) => workspace.name === GYM)?.workspaceId ?? '';
    const base = `/api/v1/workspaces/${workspaceId}`;
    const trainers = (await (await page.request.get(`${base}/trainers`)).json()) as {
      id: string;
      name: string;
    }[];
    const trainer = (name: string) => trainers.find((entry) => entry.name === name)?.id ?? '';
    const date = tuesday();
    const client = async (name: string) =>
      (
        (await created(page.request, `${base}/clients`, {
          name,
          email: `${name.split(' ')[0]?.toLowerCase()}@example.com`,
        })) as { id: string }
      ).id;
    const privateSession = async (name: string, start: string, trainerId: string) =>
      (
        (await created(page.request, `${base}/sessions/private`, {
          clientId: await client(name),
          localDate: date,
          localStart: start,
          durationMinutes: 60,
          notify: false,
          trainerId,
        })) as { session: { id: string } }
      ).session.id;
    const mark = await privateSession('Mark Jansen', '07:00', trainer('Sarah'));
    const lisa = await privateSession('Lisa Smit', '11:00', trainer('Tom'));
    const classOf = async (
      nameNl: string,
      trainerId: string | undefined,
      first?: { localDate: string; localStart: string },
    ) =>
      (await created(page.request, `${base}/group-classes`, {
        nameNl,
        capacity: 8,
        durationMinutes: 60,
        ...(trainerId ? { trainerId } : {}),
        ...(first ? { firstDate: first } : {}),
      })) as { groupClass: { id: string }; firstDate: { id: string } };
    // Kracht is weekly: its dates carry the series line "Elke dinsdag 10:00" (F022).
    const kracht = await classOf('Kracht', trainer('Sarah'));
    const morning = (await created(
      page.request,
      `${base}/group-classes/${kracht.groupClass.id}/dates`,
      { localDate: date, localStart: '10:00', repeat: 'weekly' },
    )) as { id: string };
    // The evening date of Kracht is cancelled, as cancelling will (F026).
    const evening = (await created(
      page.request,
      `${base}/group-classes/${kracht.groupClass.id}/dates`,
      {
        localDate: date,
        localStart: '18:00',
      },
    )) as { id: string };
    await cancelSession(evening.id);
    const boxing = await classOf('Boxing', undefined, {
      localDate: shift(date, 2),
      localStart: '19:15',
    });
    return {
      john,
      sarah,
      tom,
      slug,
      workspaceId,
      date,
      sessions: {
        mark,
        lisa,
        kracht: morning.id,
        krachtCancelled: evening.id,
        boxing: boxing.firstDate.id,
      },
    };
  }

  /** The blocks (or, in the list, the names) of the calendar: each opens the quick view. */
  const blocks = (page: Page) => page.getByRole('main').locator('button[aria-haspopup="dialog"]');

  test('AC1: the week starts on Monday, every block starts with its type, the legend names the types, the grid is what the API answers', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const week = await seed(page, context);
    const t = wording(copy.workspaceCalendar, appLocale);
    const shared = copy.myCalendar;
    await page.goto(`/w/${week.slug}/calendar?date=${week.date}&view=week`);

    await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
    await expect(page.getByRole('button', { name: shared.viewWeek, pressed: true })).toBeVisible();
    const grid = page
      .getByRole('region', { name: /./ })
      .filter({ has: page.locator('[data-slot="week-grid-header"]') });
    const headers = await grid.locator('[data-slot="week-grid-header"] > div').allInnerTexts();
    expect(headers).toHaveLength(7);
    // Monday first: the Tuesday of the spec is the second column.
    const tuesdayHeader = new Intl.DateTimeFormat(appLocale === 'en' ? 'en-GB' : 'nl-NL', {
      weekday: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${week.date}T12:00:00Z`));
    expect(headers[1]?.replace(/\s+/g, ' ').replace('.', '')).toContain(
      tuesdayHeader.replace('.', ''),
    );

    await expect(blocks(page)).toHaveCount(5);
    const names = await blocks(page).evaluateAll((all) =>
      all.map((one) => one.getAttribute('aria-label')),
    );
    expect(names).toEqual([
      expect.stringMatching(
        new RegExp(`^${shared.typePrivate} · Mark Jansen, .*07:00.*08:00, Sarah$`),
      ),
      expect.stringMatching(new RegExp(`^${shared.typeGroup} · Kracht, .*10:00.*11:00, Sarah, `)),
      expect.stringMatching(new RegExp(`^${shared.typePrivate} · Lisa Smit, .*11:00.*12:00, Tom$`)),
      expect.stringMatching(
        new RegExp(`^${shared.typeGroup} · Kracht, .*18:00.*19:00, Sarah, .*${shared.cancelled}$`),
      ),
      expect.stringMatching(
        new RegExp(
          `^${shared.typeGroup} · Boxing, .*19:15.*20:15, ${t.noTrainerMark.replace('!', '\\!')}`,
        ),
      ),
    ]);
    const boxing = blocks(page).filter({ hasText: 'Boxing' });
    await expect(boxing).toContainText(t.noTrainerMark);
    await expect(blocks(page).filter({ hasText: 'Kracht' }).first()).toContainText(
      shared.blockBooked.replace('{booked}', '0').replace('{capacity}', '8'),
    );
    // The cancelled date: struck through, with its word.
    const cancelled = blocks(page).filter({ hasText: shared.cancelled });
    await expect(cancelled).toHaveCount(1);
    await expect(cancelled.getByText(`${shared.typeGroup} · Kracht`)).toHaveCSS(
      'text-decoration-line',
      'line-through',
    );
    // The legend names the types in words; Open Gym comes later, so it is nowhere.
    const legend = page.getByRole('list', { name: shared.legend });
    await expect(legend).toContainText(shared.typePrivate);
    await expect(legend).toContainText(shared.typeGroup);
    await expect(page.getByText('Open Gym')).toHaveCount(0);

    // The data path: the blocks are what the API answers for the week.
    const answer = (await (
      await page.request.get(
        `/api/v1/workspaces/${week.workspaceId}/calendar?from=${shift(week.date, -1)}&to=${shift(week.date, 5)}`,
      )
    ).json()) as { items: { id: string }[] };
    expect(answer.items.map((item) => item.id).sort()).toEqual(Object.values(week.sessions).sort());
    await expectNoAxeViolations(page, `Agenda week in ${appLocale}`);
  });

  test('AC3: the Trainers and Type filters and Geannuleerde tonen are remembered after a reload and can be cleared', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const week = await seed(page, context);
    const t = wording(copy.workspaceCalendar, appLocale);
    const shared = copy.myCalendar;
    await page.goto(`/w/${week.slug}/calendar?date=${week.date}&view=week`);
    await expect(blocks(page)).toHaveCount(5);
    const option = (name: string) => page.getByRole('checkbox', { name, exact: true });

    // Trainers: only Tom leaves Lisa (a session with no trainer matches no trainer).
    for (const name of ['John', 'Sarah', t.noTrainer])
      await option(name === 'John' ? t.you : name).uncheck();
    await expect(blocks(page)).toHaveCount(1);
    await expect(blocks(page)).toContainText('Lisa Smit');
    await page.reload();
    await expect(option('Tom')).toBeChecked();
    await expect(option('Sarah')).not.toBeChecked();
    await expect(blocks(page)).toHaveCount(1);
    await option('Sarah').check();
    await option(t.noTrainer).check();
    await option(t.you).check();

    // Type: only Groepsles leaves the class dates; Geannuleerde tonen off hides the cancelled one.
    await option(shared.optionPrivate).uncheck();
    await expect(blocks(page)).toHaveCount(3);
    await option(shared.showCancelled).uncheck();
    await expect(blocks(page)).toHaveCount(2);
    await page.reload();
    await expect(option(shared.showCancelled)).not.toBeChecked();
    await expect(option(shared.optionPrivate)).not.toBeChecked();
    await expect(blocks(page)).toHaveCount(2);

    // Everything filtered out: the words and Filters wissen.
    await option(shared.optionGroup).uncheck();
    await expect(page.getByText(shared.noResults)).toBeVisible();
    await expect(blocks(page)).toHaveCount(0);
    await expectNoAxeViolations(page, `Agenda without results in ${appLocale}`);
    await page.getByRole('button', { name: shared.clearFilters }).click();
    await expect(blocks(page)).toHaveCount(5);
    await page.reload();
    await expect(option(shared.optionPrivate)).toBeChecked();
  });

  test('AC5: the list is a keyboard-reachable table per day and the default view at 800 px', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const week = await seed(page, context);
    const t = wording(copy.workspaceCalendar, appLocale);
    const shared = copy.myCalendar;
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto(`/w/${week.slug}/calendar?date=${week.date}`);

    await expect(page.getByRole('button', { name: shared.viewList, pressed: true })).toBeVisible();
    const tables = page.getByRole('table');
    await expect(tables).toHaveCount(2);
    const first = tables.first();
    for (const column of [
      shared.columnTime,
      shared.columnType,
      shared.columnSession,
      t.columnTrainer,
      t.columnLocation,
      shared.columnStatus,
    ]) {
      await expect(first.getByRole('columnheader', { name: column })).toBeVisible();
    }
    await expect(first.getByRole('row')).toHaveCount(5);
    await expect(first.getByRole('rowheader', { name: 'Mark Jansen' })).toBeVisible();
    await expect(first).toContainText(t.typePrivateSession);
    await expect(first).toContainText(t.typeGroupClass);
    await expect(tables.last()).toContainText(t.noTrainerMark);
    // Keyboard reachable: Tab lands on the first name, Enter opens its quick view.
    await first.getByRole('rowheader', { name: 'Mark Jansen' }).getByRole('button').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toContainText('Mark Jansen');
    await page.keyboard.press('Escape');
    await expectNoAxeViolations(page, `Agenda list in ${appLocale}`);
    // The other views stay one click away, and the day view has a column per trainer.
    await page.getByRole('button', { name: shared.viewDay }).click();
    await expect(page.locator('[data-slot="week-grid-header"]')).toContainText('Sarah');
    await expectNoAxeViolations(page, `Agenda day in ${appLocale}`);
  });

  test('AC6: the quick view of a private session and of a class date, without a note; Esc returns focus to the block', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const week = await seed(page, context);
    const t = wording(copy.workspaceCalendar, appLocale);
    const shared = copy.myCalendar;
    await page.goto(`/w/${week.slug}/calendar?date=${week.date}&view=week`);

    const mark = blocks(page).filter({ hasText: 'Mark Jansen' });
    await mark.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(`${shared.typePrivate} · Mark Jansen`);
    await expect(dialog).toContainText('07:00–08:00');
    await expect(dialog).toContainText(t.trainerLine.replace('{name}', 'Sarah'));
    await expect(dialog).toContainText(GYM);
    await expect(dialog.getByRole('link', { name: t.open })).toBeVisible();
    await expect(dialog.getByRole('link', { name: t.move })).toBeVisible();
    await expect(dialog.getByRole('link', { name: t.clientProfile })).toBeVisible();
    await expect(dialog.getByRole('link', { name: t.change })).toHaveCount(0);
    // Never a note, nor a contact detail of the client.
    await expect(dialog).not.toContainText('@');
    await expectNoAxeViolations(page, `Quick view of a private session in ${appLocale}`);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(mark).toBeFocused();

    const kracht = blocks(page).filter({ hasText: 'Kracht' }).first();
    await kracht.click();
    const weekday = new Intl.DateTimeFormat(appLocale === 'en' ? 'en-GB' : 'nl-NL', {
      weekday: 'long',
      timeZone: 'UTC',
    }).format(new Date(`${week.date}T12:00:00Z`));
    await expect(dialog).toContainText(
      t.seriesLine.replace('{weekday}', weekday).replace('{time}', '10:00'),
    );
    await expect(dialog).toContainText('0/8');
    await expect(dialog.getByRole('link', { name: t.open })).toBeVisible();
    await expect(dialog.getByRole('link', { name: t.change })).toBeVisible();
    await dialog.getByRole('link', { name: t.open }).click();
    // A class date opens CO-01.
    await expect(page).toHaveURL(new RegExp(`/classes/[^/]+/${week.sessions.kracht}$`));
  });

  test('AC12: a Trainer sees the whole week, has + Nieuw with Privésessie only and Openen only on a colleague’s session', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const week = await seed(page, context);
    const t = wording(copy.workspaceCalendar, appLocale);
    const shared = copy.myCalendar;
    await signInWithSession(context, week.sarah);
    await page.goto(`/w/${week.slug}/calendar?date=${week.date}&view=week`);

    await expect(blocks(page)).toHaveCount(5);
    await page.getByRole('button', { name: copy.workspaceNav.new, exact: true }).click();
    const menu = page.getByRole('list', { name: copy.workspaceNav.newMenu });
    // Privésessie, for herself, and no Groepsles (the Owner's).
    await expect(menu.getByRole('button', { name: copy.workspaceNav.newGroupClass })).toHaveCount(
      0,
    );
    await expect(
      menu.getByRole('button', { name: copy.workspaceNav.newPrivateSession }),
    ).toBeVisible();
    // Lisa's session is Tom's: Openen only.
    await blocks(page).filter({ hasText: 'Lisa Smit' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('link', { name: t.open })).toBeVisible();
    await expect(dialog.getByRole('link', { name: t.move })).toHaveCount(0);
    await expect(dialog.getByRole('link', { name: t.change })).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Her own is hers to move; the class she teaches opens without Wijzigen (the Owner's).
    await blocks(page).filter({ hasText: 'Mark Jansen' }).click();
    await expect(dialog.getByRole('link', { name: t.move })).toBeVisible();
    await page.keyboard.press('Escape');
    await blocks(page).filter({ hasText: 'Boxing' }).click();
    await expect(dialog.getByRole('link', { name: t.change })).toHaveCount(0);
    expect(
      (
        await page.request.get(
          `/api/v1/workspaces/${week.workspaceId}/calendar?from=${week.date}&to=${week.date}`,
        )
      ).status(),
    ).toBe(200);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: shared.viewWeek, pressed: true })).toBeVisible();
  });

  test('AC13: the week the clocks go back has ◐ on the Sunday, 02:00 twice and the hint in another time zone', async ({
    page,
    context,
    messages: copy,
  }) => {
    test.slow();
    const week = await seed(page, context);
    const shared = copy.myCalendar;
    const sunday = clocksBack();
    const base = `/api/v1/workspaces/${week.workspaceId}`;
    const anna = (await created(page.request, `${base}/clients`, {
      name: 'Anna de Vries',
      email: 'anna@example.com',
    })) as { id: string };
    // Anna has a session on the Sunday at 01:30, so 02:00 is in the grid.
    await created(page.request, `${base}/sessions/private`, {
      clientId: anna.id,
      localDate: sunday,
      localStart: '01:30',
      durationMinutes: 45,
      notify: false,
    });
    await page.goto(`/w/${week.slug}/calendar?date=${sunday}&view=week`);

    await expect(blocks(page)).toHaveCount(1);
    const header = page.locator('[data-slot="week-grid-header"] > div').nth(6);
    await expect(header).toContainText('◐');
    await expect(header.getByText(shared.clockBack)).toBeAttached();
    await expect(header.locator('[title]')).toHaveAttribute('title', shared.clockBack);
    // The repeated hour: two rows marked 02:00, the block above them.
    await expect(
      page.locator('[data-slot="week-grid-body"]').getByText('02:00', { exact: true }),
    ).toHaveCount(2);
    await expect(page.getByText(copy.personal.timeZoneHint)).toHaveCount(0);

    const abroad = await context.browser()?.newContext({
      baseURL: test.info().project.use.baseURL,
      timezoneId: 'America/New_York',
      locale: test.info().project.use.locale,
      extraHTTPHeaders: clientIpHeaders(),
    });
    if (!abroad) throw new Error('No browser.');
    try {
      await signInWithSession(abroad, week.john);
      const far = await abroad.newPage();
      await far.goto(`/w/${week.slug}/calendar?date=${week.date}&view=week`);
      await expect(far.getByText(copy.personal.timeZoneHint)).toBeVisible();
      await expect(far.getByRole('button', { name: /Kracht, .*10:00/ })).toBeVisible();
    } finally {
      await abroad.close();
    }
  });

  test('AC15: the week renders within a second', async ({ page, context }) => {
    test.slow();
    const week = await seed(page, context);
    const started = Date.now();
    await page.goto(`/w/${week.slug}/calendar?date=${week.date}&view=week`);
    await expect(blocks(page).first()).toBeVisible();
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
