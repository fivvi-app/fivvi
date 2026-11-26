import { type Locale, type Messages, trainerWordForms } from '@fivvi/i18n';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
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
  /** The team-member IDs of the trainers: what the day view's columns are keyed by. */
  trainerIds: { sarah: string; tom: string };
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

  /** John's Gym with Sarah and Tom on its team, and John signed in: nothing planned yet. */
  async function team(page: Page, context: Parameters<typeof signInWithSession>[0]) {
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
    return { john, sarah, tom, slug, workspaceId, base, trainer };
  }

  /** The team, signed in as John, and the week of the spec planned through the API as the Owner does. */
  async function seed(page: Page, context: Parameters<typeof signInWithSession>[0]): Promise<Week> {
    const { john, sarah, tom, slug, workspaceId, base, trainer } = await team(page, context);
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
      trainerIds: { sarah: trainer('Sarah'), tom: trainer('Tom') },
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

  test('#1595: a class with a Dutch and an English name shows the name of the page’s language on the Agenda, for an account with no stored language', async ({
    page,
    context,
    appLocale,
  }) => {
    test.slow();
    const { slug, base } = await team(page, context);
    const date = tuesday();
    const name = (locale: Locale) => (locale === 'en' ? 'Strength' : 'Kracht');
    const other = name(appLocale === 'en' ? 'nl-NL' : 'en');
    const { groupClass } = (await created(page.request, `${base}/group-classes`, {
      nameNl: 'Kracht',
      nameEn: 'Strength',
      capacity: 8,
      durationMinutes: 60,
    })) as { groupClass: { id: string } };
    await created(page.request, `${base}/group-classes/${groupClass.id}/dates`, {
      localDate: date,
      localStart: '10:00',
    });

    // The list, the default view at 800 px.
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto(`/w/${slug}/calendar?date=${date}`);
    const list = page.getByRole('table').first();
    await expect(list.getByRole('rowheader', { name: name(appLocale) })).toBeVisible();
    await expect(list).not.toContainText(other);

    // The week, and the title of the quick view.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/w/${slug}/calendar?date=${date}&view=week`);
    const block = blocks(page).filter({ hasText: name(appLocale) });
    await expect(block).toHaveCount(1);
    await expect(blocks(page).filter({ hasText: other })).toHaveCount(0);
    await block.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: name(appLocale) })).toBeVisible();
    await expect(dialog).not.toContainText(other);
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
    // A sheet on the right, the height of the window: not a modal in the middle (WC-05).
    const size = page.viewportSize();
    const box = await dialog.boundingBox();
    expect(size && box && Math.round(box.x + box.width)).toBe(size?.width);
    expect(box?.y).toBe(0);
    expect(box?.height).toBe(size?.height);
    expect(box?.x).toBeGreaterThan((size?.width ?? 0) / 2);
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
    // Trainers may see clients (clients.view), but not through a colleague's session.
    await expect(dialog.getByRole('link', { name: t.clientProfile })).toHaveCount(0);
    await expect(dialog.getByRole('link')).toHaveCount(1);
    await page.keyboard.press('Escape');
    // Her own is hers to move; the class she teaches opens without Wijzigen (the Owner's).
    await blocks(page).filter({ hasText: 'Mark Jansen' }).click();
    await expect(dialog.getByRole('link', { name: t.move })).toBeVisible();
    await expect(dialog.getByRole('link', { name: t.clientProfile })).toBeVisible();
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

  test('AC13: the week the clocks go back has ◐ on the Sunday, 02:00 twice, Kracht at 10:00 on the Tuesday and the hint in another time zone', async ({
    page,
    context,
    messages: copy,
  }) => {
    test.slow();
    // Only what the week needs, so what is in it does not depend on the day the test runs: the
    // weekly Kracht of the week of the spec would reach this week for part of the year.
    const { john, slug, base, trainer } = await team(page, context);
    const shared = copy.myCalendar;
    const sunday = clocksBack();
    const tuesdayOfWeek = shift(sunday, -5);
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
    // Kracht on the Tuesday at 10:00 (the 20th of October in the spec's year), one date.
    await created(page.request, `${base}/group-classes`, {
      nameNl: 'Kracht',
      capacity: 8,
      durationMinutes: 60,
      trainerId: trainer('John'),
      firstDate: { localDate: tuesdayOfWeek, localStart: '10:00' },
    });
    await page.goto(`/w/${slug}/calendar?date=${sunday}&view=week`);

    await expect(blocks(page)).toHaveCount(2);
    await expect(blocks(page).filter({ hasText: 'Kracht' })).toHaveAccessibleName(
      /Kracht, .*10:00.*11:00/,
    );
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
      await signInWithSession(abroad, john);
      const far = await abroad.newPage();
      await far.goto(`/w/${slug}/calendar?date=${sunday}&view=week`);
      await expect(far.getByText(copy.personal.timeZoneHint)).toBeVisible();
      // Still Amsterdam's 10:00, not New York's 04:00.
      await expect(far.getByRole('button', { name: /Kracht, .*10:00/ })).toBeVisible();
    } finally {
      await abroad.close();
    }
  });

  test('AC6: Verplaatsen opens PS-05 and Wijzigen opens CO-04 at once; Openen opens the session with no dialog', async ({
    page,
    context,
    messages: copy,
  }) => {
    test.slow();
    const week = await seed(page, context);
    const t = copy.workspaceCalendar;
    await page.goto(`/w/${week.slug}/calendar?date=${week.date}&view=week`);
    const dialog = page.getByRole('dialog');

    // Openen: the session's page with nothing open on it.
    await blocks(page).filter({ hasText: 'Mark Jansen' }).click();
    await dialog.getByRole('link', { name: t.open }).click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${week.sessions.mark}$`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Mark Jansen');
    await expect(page.getByRole('button', { name: copy.sessions.page.reschedule })).toBeEnabled();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Verplaatsen: the same page with PS-05 open.
    await page.goBack();
    await blocks(page).filter({ hasText: 'Mark Jansen' }).click();
    await dialog.getByRole('link', { name: t.move }).click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${week.sessions.mark}\\?move=1$`));
    await expect(page.getByRole('dialog')).toContainText(copy.sessions.reschedule.title);

    // Wijzigen: the class date's page with CO-04 open.
    await page.goto(`/w/${week.slug}/calendar?date=${week.date}&view=week`);
    await blocks(page).filter({ hasText: 'Kracht' }).first().click();
    await dialog.getByRole('link', { name: t.change }).click();
    await expect(page).toHaveURL(new RegExp(`/classes/[^/]+/${week.sessions.kracht}\\?edit=1$`));
    await expect(page.getByRole('dialog')).toContainText(copy.classes.edit.title);
    await page.keyboard.press('Escape');
    // Openen on the same date: no dialog.
    await page.goBack();
    await blocks(page).filter({ hasText: 'Kracht' }).first().click();
    await dialog.getByRole('link', { name: t.open }).click();
    await expect(page).toHaveURL(new RegExp(`/classes/[^/]+/${week.sessions.kracht}$`));
    await expect(page.getByRole('button', { name: copy.classes.date.edit })).toBeEnabled();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('an empty week offers + Privésessie, and + Groepsles to the Owner only', async ({
    page,
    context,
    messages: copy,
  }) => {
    test.slow();
    const week = await seed(page, context);
    const t = copy.workspaceCalendar;
    // The week before the seeded one holds nothing.
    const empty = `/w/${week.slug}/calendar?date=${shift(week.date, -14)}&view=week`;
    await page.goto(empty);
    await expect(page.getByRole('main').getByText(t.emptyWeek)).toBeVisible();
    await expect(page.getByRole('button', { name: t.newPrivate })).toBeVisible();
    await page.getByRole('button', { name: t.newGroup }).click();
    await expect(page.getByRole('dialog')).toContainText(copy.classes.schedule.title);
    await page.keyboard.press('Escape');
    await expectNoAxeViolations(page, 'Empty week');

    await signInWithSession(context, week.sarah);
    await page.goto(empty);
    await expect(page.getByRole('button', { name: t.newPrivate })).toBeVisible();
    await expect(page.getByRole('button', { name: t.newGroup })).toHaveCount(0);
  });

  test('the shortcuts work while focus is in the calendar, not elsewhere, and ← → leave the grid’s scroll alone', async ({
    page,
    context,
    messages: copy,
  }) => {
    test.slow();
    const week = await seed(page, context);
    const shared = copy.myCalendar;
    await page.goto(`/w/${week.slug}/calendar?date=${week.date}&view=week`);
    const pressed = (name: string) => page.getByRole('button', { name, pressed: true });
    await expect(pressed(shared.viewWeek)).toBeVisible();

    // Outside the calendar (the navigation) a letter does nothing.
    await page.getByRole('navigation').getByRole('link').first().focus();
    await page.keyboard.press('l');
    await expect(pressed(shared.viewWeek)).toBeVisible();

    // Inside it, L is the list and D the day; typing in a filter is not a shortcut.
    await page.getByRole('link', { name: shared.today }).focus();
    await page.keyboard.press('l');
    await expect(pressed(shared.viewList)).toBeVisible();
    await page.getByRole('checkbox').first().focus();
    await page.keyboard.press('d');
    await expect(pressed(shared.viewList)).toBeVisible();
    await page.getByRole('link', { name: shared.today }).focus();
    await page.keyboard.press('d');
    await expect(pressed(shared.viewDay)).toBeVisible();
    await page.keyboard.press('w');
    await expect(pressed(shared.viewWeek)).toBeVisible();

    // → goes to the next week from the toolbar, but not from the grid, which scrolls sideways.
    await page
      .getByRole('region', { name: /./ })
      .filter({ has: page.locator('[data-slot="week-grid-header"]') })
      .focus();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(new RegExp(`date=${week.date}`));
    await page.getByRole('link', { name: shared.today }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(new RegExp(`date=${shift(week.date, 7)}`));
  });

  // ---------------------------------------------------------------------------------------------
  // F014 WC-03, WC-06, WC-07 (tickets #530 and #531): the day per trainer, a click on an empty
  // moment and moving by dragging. The grid is 48 px an hour from 06:00 (nothing in these weeks
  // starts earlier and the last block ends before 21:00): a minute is 0.8 px.
  // ---------------------------------------------------------------------------------------------
  const FIRST_HOUR = 6;
  const MINUTE_PX = 0.8;

  /** The columns of the grid, in order. */
  const gridColumns = (page: Page) => page.locator('[data-slot="week-grid-body"] > [data-column]');

  /** The screen point of `time` (`HH:mm`) in `column`; the page is tall enough for the whole grid. */
  async function pointAt(column: Locator, time: string, offsetMinutes = 0) {
    await column.scrollIntoViewIfNeeded();
    const box = await column.boundingBox();
    if (!box) throw new Error('The column is not on the page.');
    const [hour, minute] = time.split(':').map(Number);
    const minutes = (hour ?? 0) * 60 + (minute ?? 0) - FIRST_HOUR * 60 + offsetMinutes;
    return { x: box.x + box.width / 2, y: box.y + minutes * MINUTE_PX };
  }

  /** Drags the block from its middle by `minutes` (60 minutes are 48 px), over `steps` pointer moves. */
  async function dragBlock(page: Page, block: Locator, minutes: number, sideways = 0) {
    const box = await block.boundingBox();
    if (!box) throw new Error('The block is not on the page.');
    const x = box.x + box.width / 2;
    const y = box.y + Math.min(box.height / 2, 20);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + sideways / 2, y + (minutes * MINUTE_PX) / 2, { steps: 6 });
    await page.mouse.move(x + sideways, y + minutes * MINUTE_PX, { steps: 6 });
    await page.mouse.up();
  }

  const shortDate = (date: string, appLocale: Locale) =>
    new Intl.DateTimeFormat(appLocale === 'en' ? 'en-GB' : 'nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })
      .format(new Date(`${date}T12:00:00Z`))
      .replace(/\./g, '');
  const plain = (text: string | null) =>
    (text ?? '').replace(/\./g, '').replace(/\s+/g, ' ').trim();

  /** The local time of a session's start as the API stores it, in the workspace's time zone. */
  async function startOf(page: Page, week: Week, id: string, date = week.date) {
    const answer = (await (
      await page.request.get(
        `/api/v1/workspaces/${week.workspaceId}/calendar?from=${shift(date, -1)}&to=${shift(date, 3)}`,
      )
    ).json()) as { items: { id: string; startsAt: string }[] };
    const item = answer.items.find((entry) => entry.id === id);
    return item
      ? new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
          timeZone: 'Europe/Amsterdam',
        }).format(new Date(item.startsAt))
      : undefined;
  }

  test('AC4: the day view has a column per trainer and Geen trainer only on the day that needs it', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const week = await seed(page, context);
    const t = wording(copy.workspaceCalendar, appLocale);
    await page.goto(`/w/${week.slug}/calendar?date=${week.date}&view=day`);

    const headers = page.locator('[data-slot="week-grid-header"] > div');
    // John (You), Sarah and Tom; no Geen trainer column on Tuesday.
    await expect(headers).toHaveText([t.you, 'Sarah', 'Tom']);
    const columns = gridColumns(page);
    await expect(columns).toHaveCount(3);
    await expect(columns.nth(1).locator('button[aria-haspopup="dialog"]')).toHaveCount(3);
    await expect(columns.nth(1)).toContainText('Mark Jansen');
    await expect(columns.nth(1)).toContainText('Kracht');
    await expect(columns.nth(2)).toContainText('Lisa Smit');
    await expect(columns.nth(0).locator('button')).toHaveCount(0);
    await expectNoAxeViolations(page, `Agenda day Tuesday in ${appLocale}`);

    // Thursday: Boxing has no trainer, so there is a column for that.
    await page.goto(`/w/${week.slug}/calendar?date=${shift(week.date, 2)}&view=day`);
    await expect(headers).toHaveText([t.you, 'Sarah', 'Tom', t.noTrainer]);
    await expect(gridColumns(page).nth(3)).toContainText('Boxing');
    await expect(gridColumns(page).nth(3).locator('button')).toHaveCount(1);
    await expectNoAxeViolations(page, `Agenda day Thursday in ${appLocale}`);
  });

  test('AC7: a click on an empty moment offers Privésessie and Groepsles, PS-01 is filled in with the date and the time, and in the day view with the column’s trainer', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 1500 });
    const week = await seed(page, context);
    const t = wording(copy.workspaceCalendar, appLocale);
    const wednesday = shift(week.date, 1);
    await page.goto(`/w/${week.slug}/calendar?date=${week.date}&view=week`);

    // Wednesday 14:00 of the week.
    const column = gridColumns(page).nth(2);
    await expect(column).toHaveAttribute('data-column', wednesday);
    const click = await pointAt(column, '14:00', 6);
    await page.mouse.click(click.x, click.y);
    const menu = page.getByRole('dialog', {
      name: t.newAt.replace('{date}', shortDate(wednesday, appLocale)).replace('{time}', '14:00'),
    });
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole('button', { name: copy.workspaceNav.newPrivateSession }),
    ).toBeVisible();
    await expect(menu.getByRole('button', { name: copy.workspaceNav.newGroupClass })).toBeVisible();
    await expectNoAxeViolations(page, `New at a time slot in ${appLocale}`);

    // Privésessie: PS-01 with that date and time; in the week there is no column's trainer.
    await menu.getByRole('button', { name: copy.workspaceNav.newPrivateSession }).click();
    const form = page.getByRole('dialog', { name: copy.sessions.form.title });
    await expect(form.locator('input[name="localDate"]')).toHaveValue(wednesday);
    await expect(form.locator('input[name="localStart"]')).toHaveValue('14:00');
    await expect(
      form.getByText(copy.sessions.form.endsAt.replace('{time}', '15:00')),
    ).toBeVisible();
    // Nothing was typed after the slot: Esc closes it without asking to discard.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Groepsles: Op een datum plannen with the date and the start.
    await page.mouse.click(click.x, click.y);
    await menu.getByRole('button', { name: copy.workspaceNav.newGroupClass }).click();
    const schedule = page.getByRole('dialog', { name: copy.classes.schedule.title });
    await expect(schedule.locator('input[name="localDate"]')).toHaveValue(wednesday);
    await expect(schedule.locator('input[name="localStart"]')).toHaveValue('14:00');
    await page.keyboard.press('Escape');

    // Click and drag over 14:00-15:30 sets the length too.
    const from = await pointAt(column, '14:00', 6);
    const to = await pointAt(column, '15:30', -3);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, (from.y + to.y) / 2, { steps: 5 });
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await expect(page.locator('[data-slot="week-grid-selection"]')).toBeVisible();
    await page.mouse.up();
    await menu.getByRole('button', { name: copy.workspaceNav.newPrivateSession }).click();
    await expect(form.locator('input[name="localStart"]')).toHaveValue('14:00');
    await expect(
      form.getByText(copy.sessions.form.endsAt.replace('{time}', '15:30')),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    // The day view: a click in Tom's column also fills in Tom.
    await page.goto(`/w/${week.slug}/calendar?date=${week.date}&view=day`);
    const tom = gridColumns(page).nth(2);
    const inTom = await pointAt(tom, '14:00', 6);
    await page.mouse.click(inTom.x, inTom.y);
    await expect(
      page.getByRole('dialog', {
        name: t.newAt.replace('{date}', shortDate(week.date, appLocale)).replace('{time}', '14:00'),
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: copy.workspaceNav.newPrivateSession }).click();
    await expect(form.locator('input[name="localDate"]')).toHaveValue(week.date);
    await expect(form.locator('input[name="localStart"]')).toHaveValue('14:00');
    await expect(form.locator('select[name="trainerId"]')).toHaveValue(week.trainerIds.tom);
    await expectNoAxeViolations(page, `New private session from a slot in ${appLocale}`);
  });

  test('AC12: a Trainer gets no empty-slot menu and cannot drag a block', async ({
    page,
    context,
    messages: copy,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 1500 });
    const week = await seed(page, context);
    await signInWithSession(context, week.sarah);
    await page.goto(`/w/${week.slug}/calendar?date=${week.date}&view=week`);

    const column = gridColumns(page).nth(2);
    await expect(column).toHaveCSS('cursor', 'auto');
    const click = await pointAt(column, '14:00', 6);
    await page.mouse.click(click.x, click.y);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Her own session does not move by dragging either: that is the Owner's (the form is hers).
    const mark = blocks(page).filter({ hasText: 'Mark Jansen' });
    await dragBlock(page, mark, 60);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await startOf(page, week, week.sessions.mark)).toBe('07:00');
    // And the API answers her move of Tom's session 403.
    const lisa = await page.request.post(
      `/api/v1/workspaces/${week.workspaceId}/sessions/${week.sessions.lisa}/reschedule`,
      {
        data: {
          localDate: week.date,
          localStart: '13:00',
          durationMinutes: 60,
          notify: false,
          version: 1,
        },
      },
    );
    expect(lisa.status()).toBe(403);
    await expect(
      page.getByRole('button', { name: copy.myCalendar.viewWeek, pressed: true }),
    ).toBeVisible();
  });

  test('AC8: dragging Mark’s session asks first, Terug changes nothing, Verplaatsen moves it with the e-mail only when checked', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 1500 });
    const week = await seed(page, context);
    const t = wording(copy.workspaceCalendar, appLocale);
    await page.goto(`/w/${week.slug}/calendar?date=${week.date}&view=week`);

    const mark = blocks(page).filter({ hasText: 'Mark Jansen' });
    await dragBlock(page, mark, 60);
    const dialog = page.getByRole('dialog', { name: t.moveTitle.replace('{name}', 'Mark Jansen') });
    await expect(dialog).toBeVisible();
    // {old} → {new}, with the e-mail on by default for a session still to come.
    const day = shortDate(week.date, appLocale);
    expect(plain(await dialog.locator('#move-description').textContent())).toBe(
      t.moveFromTo.replace('{from}', `${day} 07:00`).replace('{to}', `${day} 08:00`),
    );
    await expect(
      dialog.getByRole('checkbox', {
        name: copy.sessions.reschedule.notify.replace('{client}', 'Mark Jansen'),
      }),
    ).toBeChecked();
    await expectNoAxeViolations(page, `Move by dragging in ${appLocale}`);

    // Terug changes nothing.
    await dialog.getByRole('button', { name: t.moveBack }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await startOf(page, week, week.sessions.mark)).toBe('07:00');

    // Verplaatsen moves it, with the e-mail unchecked here; nothing else moves.
    await dragBlock(page, mark, 60);
    await dialog
      .getByRole('checkbox', {
        name: copy.sessions.reschedule.notify.replace('{client}', 'Mark Jansen'),
      })
      .uncheck();
    // What reaches F020's reschedule says no e-mail (EM-04 only when the box is checked).
    const reschedule = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().endsWith(`/sessions/${week.sessions.mark}/reschedule`),
    );
    await dialog.getByRole('button', { name: t.moveConfirm }).click();
    expect((await reschedule).postDataJSON()).toMatchObject({ notify: false });
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: t.moved.replace('{date}', day).replace('{time}', '08:00') }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await startOf(page, week, week.sessions.mark)).toBe('08:00');
    expect(await startOf(page, week, week.sessions.lisa)).toBe('11:00');
    // The week was loaded again: the block says its new time.
    await expect(blocks(page).filter({ hasText: 'Mark Jansen' })).toHaveAttribute(
      'aria-label',
      /08:00.*09:00/,
    );
  });

  test('AC8: a class date asks Alleen deze les or Deze en alle volgende lessen and applies the scope; a class date does not change day', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 1500 });
    const week = await seed(page, context);
    const t = wording(copy.workspaceCalendar, appLocale);
    // Kracht is weekly: the date a week later is a date of the series, and so is the one after.
    const next = shift(week.date, 7);
    await page.goto(`/w/${week.slug}/calendar?date=${next}&view=week`);

    const kracht = blocks(page)
      .filter({ hasText: /Kracht/ })
      .first();
    // Not to another day: a class date has its day (CO-04 changes the time only), so nothing opens.
    await dragBlock(page, kracht, 0, 150);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await dragBlock(page, kracht, 30);
    const dialog = page.getByRole('dialog', { name: t.moveTitle.replace('{name}', 'Kracht') });
    await expect(dialog).toBeVisible();
    const day = shortDate(next, appLocale);
    expect(plain(await dialog.locator('#move-description').textContent())).toBe(
      t.moveFromTo.replace('{from}', `${day} 10:00`).replace('{to}', `${day} 10:30`),
    );
    await expect(dialog.getByRole('radio', { name: copy.classes.edit.scopeThis })).toBeChecked();
    // No e-mail for a class: nobody has booked yet.
    await expect(dialog.getByRole('checkbox')).toHaveCount(0);
    await expectNoAxeViolations(page, `Move a class date in ${appLocale}`);
    await dialog.getByRole('radio', { name: copy.classes.edit.scopeFollowing }).check();
    await dialog.getByRole('button', { name: t.moveConfirm }).click();
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: t.moved.replace('{date}', day).replace('{time}', '10:30') }),
    ).toBeVisible();

    // This date and the ones after it moved; the one before did not.
    expect(await startOf(page, week, week.sessions.kracht)).toBe('10:00');
    const answer = (await (
      await page.request.get(
        `/api/v1/workspaces/${week.workspaceId}/calendar?from=${next}&to=${shift(next, 14)}`,
      )
    ).json()) as { items: { className?: string; startsAt: string }[] };
    const times = answer.items
      .filter((item) => item.className === 'Kracht')
      .map((item) =>
        new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
          timeZone: 'Europe/Amsterdam',
        }).format(new Date(item.startsAt)),
      );
    expect(times.filter((time) => time === '10:30').length).toBeGreaterThanOrEqual(2);
    expect(times).not.toContain('10:00');
  });

  test('AC9: a session someone else changed meanwhile answers 409, the calendar says who and shows the week as it is now', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 1500 });
    const week = await seed(page, context);
    const t = wording(copy.workspaceCalendar, appLocale);
    await page.goto(`/w/${week.slug}/calendar?date=${week.date}&view=week`);
    await expect(blocks(page)).toHaveCount(5);

    // Sarah moves her own session (Mark's) to 09:00 while John's page still shows 07:00.
    await signInWithSession(context, week.sarah);
    const moved = await page.request.post(
      `/api/v1/workspaces/${week.workspaceId}/sessions/${week.sessions.mark}/reschedule`,
      {
        data: {
          localDate: week.date,
          localStart: '09:00',
          durationMinutes: 60,
          notify: false,
          version: 1,
        },
      },
    );
    expect(moved.status()).toBe(200);
    await signInWithSession(context, week.john);

    await dragBlock(page, blocks(page).filter({ hasText: 'Mark Jansen' }), 60);
    await page
      .getByRole('dialog', { name: t.moveTitle.replace('{name}', 'Mark Jansen') })
      .getByRole('button', { name: t.moveConfirm })
      .click();
    await expect(
      page.getByRole('alert').filter({ hasText: t.moveChangedBy.replace('{name}', 'Sarah') }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // The reloaded week: Mark is where Sarah put him, and John's move was not made.
    await expect(blocks(page).filter({ hasText: 'Mark Jansen' })).toHaveAttribute(
      'aria-label',
      /09:00.*10:00/,
    );
    expect(await startOf(page, week, week.sessions.mark)).toBe('09:00');
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
