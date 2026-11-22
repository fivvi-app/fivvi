import { formattingLocales, type Locale, trainerWordForms } from '@fivvi/i18n';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  assignTrainer,
  cancelSession,
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  joinTeam,
  leaveTeam,
  newAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';

// F014 (spec #458, ticket #532): the Owner's Dashboard on the web (WC-01). Copy comes from the
// catalogs. John owns John's Gym and trains there; Sarah and Tom are its Trainers. The day is the
// spec's Tuesday 22 September moved to today, because the API plans no day in the past and the
// Dashboard shows today: Mark with Sarah at 07:00, the class Kracht at 10:00 with Sarah (capacity
// 8), Lisa with Tom at 11:00, a cancelled Kracht at 18:00 and, two days on, Boxing at 19:15
// without a trainer. What is done and what is still to come depends on the clock, so it is read
// from the clock here too.
const GYM = "John's Gym";
const PHONE = { width: 390, height: 844 };
const DAY = 24 * 60 * 60 * 1000;
const isoDay = (instant: number) => new Date(instant).toISOString().slice(0, 10);

/** Today in Dutch time, `YYYY-MM-DD`: the day the Dashboard shows. */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date());
}

/** The minutes since midnight in Dutch time, now. */
function minutesNow(): number {
  const [hour = 0, minute = 0] = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date())
    .split(':')
    .map(Number);
  return hour * 60 + minute;
}

/** `YYYY-MM-DD` of `days` after today. */
const inDays = (days: number) => isoDay(Date.parse(`${today()}T12:00:00Z`) + days * DAY);

/** Fills in the workspace's word for the people who teach (F068): *trainer*. */
function wording(locale: Locale) {
  const fill = (message: string) =>
    Object.entries(trainerWordForms('trainer', locale)).reduce(
      (text, [name, word]) => text.replaceAll(`{${name}}`, word),
      message,
    );
  return { fill };
}

/** A weekday and date as the page writes them in the reader's language: "do 24 sep". */
function shortDay(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(formattingLocales[locale], {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T12:00:00Z`));
}

/**
 * The page's main region. While the page streams in past its loading boundary its content is for
 * a moment in the document twice (the hidden copy that is swapped in), which a text query on the
 * whole page would find twice; in `main` it is found once.
 */
const inMain = (page: Page) => page.getByRole('main');

interface Seed {
  john: string;
  sarah: string;
  tom: string;
  slug: string;
  workspaceId: string;
  sessions: Record<'mark' | 'lisa' | 'kracht' | 'krachtCancelled' | 'boxing', string>;
}

test.describe('F014 the Owner’s Dashboard on the web', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  async function created(request: APIRequestContext, url: string, data: unknown) {
    const response = await request.post(url, { data });
    expect(response.status(), url).toBe(201);
    return response.json();
  }

  /** John's Gym with John (Owner, trains) signed in, and `others` as Trainers: nothing planned yet. */
  async function team(
    page: Page,
    context: Parameters<typeof signInWithSession>[0],
    others: ('sarah' | 'tom')[] = ['sarah', 'tom'],
  ) {
    const john = newAddress('john');
    const sarah = newAddress('sarah');
    const tom = newAddress('tom');
    await createAccount(john, undefined, 'John');
    await createAccount(sarah, undefined, 'Sarah');
    await createAccount(tom, undefined, 'Tom');
    const slug = await createGymWithTrainer(john, GYM, 'owner');
    if (others.includes('sarah')) await joinTeam(sarah, slug, 'trainer');
    if (others.includes('tom')) await joinTeam(tom, slug, 'trainer');
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
    const client = async (name: string) =>
      (
        (await created(page.request, `${base}/clients`, {
          name,
          email: `${name.split(' ')[0]?.toLowerCase()}@example.com`,
        })) as { id: string }
      ).id;
    const privateSession = async (name: string, start: string, trainerId: string, date = today()) =>
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
    const classDate = async (classId: string, localStart: string, date = today()) =>
      (
        (await created(page.request, `${base}/group-classes/${classId}/dates`, {
          localDate: date,
          localStart,
        })) as { id: string }
      ).id;
    return { john, sarah, tom, slug, workspaceId, trainer, privateSession, classOf, classDate };
  }

  /** The team, and today of the spec planned through the API as the Owner does. */
  async function seed(page: Page, context: Parameters<typeof signInWithSession>[0]): Promise<Seed> {
    const gym = await team(page, context);
    const mark = await gym.privateSession('Mark Jansen', '07:00', gym.trainer('Sarah'));
    const lisa = await gym.privateSession('Lisa Smit', '11:00', gym.trainer('Tom'));
    const kracht = await gym.classOf('Kracht', gym.trainer('Sarah'));
    const morning = await gym.classDate(kracht.groupClass.id, '10:00');
    const evening = await gym.classDate(kracht.groupClass.id, '18:00');
    await cancelSession(evening);
    const boxing = await gym.classOf('Boxing', undefined, {
      localDate: inDays(2),
      localStart: '19:15',
    });
    return {
      john: gym.john,
      sarah: gym.sarah,
      tom: gym.tom,
      slug: gym.slug,
      workspaceId: gym.workspaceId,
      sessions: {
        mark,
        lisa,
        kracht: morning,
        krachtCancelled: evening,
        boxing: boxing.firstDate.id,
      },
    };
  }

  /** The ends of the three sessions that take place, in minutes of the day: how many are done now. */
  const endsAt = { mark: 8 * 60, kracht: 11 * 60, lisa: 12 * 60 };
  const doneNow = () => Object.values(endsAt).filter((end) => end <= minutesNow()).length;

  test('AC10: the Owner’s Dashboard shows today’s tiles, a lane per trainer, Aandacht nodig and Nog vandaag, and Mijn dag opens the Owner’s own day', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const week = await seed(page, context);
    const t = copy.workspaceDashboard;
    const { fill } = wording(appLocale);
    await page.goto(`/w/${week.slug}`);

    await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
    // "VANDAAG · DINSDAG 22 SEPTEMBER": today, in the reader's language.
    const longDay = new Intl.DateTimeFormat(formattingLocales[appLocale], {
      timeZone: 'UTC',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(`${today()}T12:00:00Z`));
    await expect(inMain(page).getByText(t.today.replace('{date}', longDay))).toBeVisible();

    // The tiles: the cancelled evening class counts for nothing; the class has 0 of 8 places taken.
    const tiles = page.getByRole('list', { name: t.kpiLabel });
    const done = doneNow();
    await expect(tiles.getByRole('listitem').filter({ hasText: t.sessionsToday })).toContainText(
      `${done}/3`,
    );
    await expect(tiles.getByRole('listitem').filter({ hasText: t.groupSpots })).toContainText(
      '0/8',
    );
    await expect(tiles.getByRole('listitem').filter({ hasText: t.groupSpots })).toContainText(
      t.groupBooked,
    );

    // The lanes: one per trainer who has a session today, each block opening its session.
    const lanes = page.getByRole('region', { name: fill(t.lanesLabel) });
    await expect(lanes).toBeVisible();
    await expect(lanes.getByRole('listitem').filter({ hasText: 'Sarah' }).first()).toBeVisible();
    await expect(lanes.getByRole('listitem').filter({ hasText: 'Tom' }).first()).toBeVisible();
    for (const id of [
      week.sessions.mark,
      week.sessions.kracht,
      week.sessions.lisa,
      week.sessions.krachtCancelled,
    ]) {
      await expect(lanes.locator(`a[href$="/sessions/${id}"]`)).toHaveCount(1);
    }
    const kracht = lanes.locator(`a[href$="/sessions/${week.sessions.kracht}"]`);
    await expect(kracht).toContainText('Kracht');
    await expect(kracht).toContainText('0/8');
    // Both kinds are there, so the blocks say their type in words, colour only supports.
    await expect(kracht).toContainText(copy.myCalendar.typeGroup);
    await expect(lanes.locator(`a[href$="/sessions/${week.sessions.mark}"]`)).toContainText(
      copy.myCalendar.typePrivate,
    );
    // The cancelled evening date is struck through.
    await expect(
      lanes.locator(`a[href$="/sessions/${week.sessions.krachtCancelled}"]`),
    ).toContainText(copy.myCalendar.cancelled);

    // Aandacht nodig: Boxing without a trainer, with Toewijzen that opens the class date.
    const attention = page.getByRole('heading', { level: 2, name: t.attentionTitle });
    await expect(attention).toBeVisible();
    const row = fill(t.attentionNoTrainer)
      .replace('{name}', 'Boxing')
      .replace('{date}', shortDay(inDays(2), appLocale))
      .replace('{time}', '19:15');
    await expect(inMain(page).getByText(row, { exact: true })).toBeVisible();
    const assign = page.getByRole('link', { name: t.assignLabel.replace('{item}', row) });
    await expect(assign).toHaveText(t.assign);
    await expect(assign).toHaveAttribute('href', new RegExp(`/sessions/${week.sessions.boxing}$`));

    // Nog vandaag: the four columns and what has not ended yet, in time order.
    const table = page.getByRole('table', { name: t.stillToday });
    const upcoming = (['mark', 'kracht', 'lisa'] as const).filter(
      (key) => endsAt[key] > minutesNow(),
    );
    if (upcoming.length > 0) {
      await expect(
        table
          .getByRole('columnheader')
          .evaluateAll((cells) => cells.map((cell) => cell.textContent)),
      ).resolves.toEqual([
        t.columnTime,
        t.columnSession,
        fill(copy.workspaceCalendar.columnTrainer),
        t.columnOccupancy,
      ]);
      await expect(table.getByRole('row')).toHaveCount(upcoming.length + 1);
      if (upcoming.includes('lisa')) {
        const lisaRow = table.getByRole('row').filter({ hasText: 'Lisa Smit' });
        await expect(lisaRow).toContainText('11:00–12:00');
        await expect(lisaRow).toContainText('Tom');
        // A private session shows its place instead of places.
        await expect(lisaRow).toContainText(GYM);
      }
    } else {
      await expect(inMain(page).getByText(t.noMoreToday)).toBeVisible();
    }
    await expect(page.getByRole('link', { name: t.toCalendar })).toHaveAttribute(
      'href',
      `/w/${week.slug}/calendar`,
    );
    await expectNoAxeViolations(page, `the Dashboard in ${appLocale}`);

    // The toggle: John trains and has a team; Mijn dag is his own day (F013).
    const toggle = page.getByRole('navigation', { name: t.scopeLabel });
    await expect(toggle.getByRole('link', { name: GYM })).toHaveAttribute('aria-current', 'page');
    const sidebar = page.getByRole('navigation', { name: copy.workspaceNav.label });
    await expect(sidebar.getByRole('link', { name: copy.workspaceNav.dashboard })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await toggle.getByRole('link', { name: copy.workspaceNav.myDay }).click();
    await expect(page).toHaveURL('/me/day');
    await expect(page.getByRole('heading', { level: 1, name: copy.myDay.title })).toBeVisible();

    // The way back is there on both sides (the prototype): the toggle on Mijn dag and the
    // Dashboard in the sidebar, which is not the current page here.
    await expect(page.getByRole('navigation', { name: t.scopeLabel })).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: t.scopeLabel })
        .getByRole('link', { name: copy.workspaceNav.myDay }),
    ).toHaveAttribute('aria-current', 'page');
    await expectNoAxeViolations(page, `Mijn dag of an Owner with a team in ${appLocale}`);
    await expect(
      sidebar.getByRole('link', { name: copy.workspaceNav.dashboard }),
    ).not.toHaveAttribute('aria-current', 'page');
    await page
      .getByRole('navigation', { name: t.scopeLabel })
      .getByRole('link', { name: GYM })
      .click();
    await expect(page).toHaveURL(`/w/${week.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
    await page.goBack();
    await sidebar.getByRole('link', { name: copy.workspaceNav.dashboard }).click();
    await expect(page).toHaveURL(`/w/${week.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
  });

  test('A Trainer’s home stays Mijn dag: opening the workspace address lands there, and the Dashboard is not in the Trainer’s navigation', async ({
    page,
    context,
    messages: copy,
  }) => {
    const gym = await team(page, context);
    await context.clearCookies();
    await signInWithSession(context, gym.sarah);
    await page.goto(`/w/${gym.slug}`);

    await expect(page).toHaveURL('/me/day');
    await expect(page.getByRole('heading', { level: 1, name: copy.myDay.title })).toBeVisible();
    await expect(page.getByRole('heading', { name: copy.noPermission.title })).toHaveCount(0);
    await expect(page.getByText(`${GYM} · ${copy.roles.trainer}`)).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: copy.workspaceNav.label })
        .getByRole('link', { name: copy.workspaceNav.dashboard }),
    ).toHaveCount(0);
    // Nobody but the Owner has the toggle: Mijn dag is the Trainer's whole day.
    await expect(
      page.getByRole('navigation', { name: copy.workspaceDashboard.scopeLabel }),
    ).toHaveCount(0);
  });

  test('Design: a workspace with private sessions only has no Groepsplekken tile and no type words, and the phone has no page scroll', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const gym = await team(page, context, ['sarah']);
    await gym.privateSession('Mark Jansen', '07:00', gym.trainer('Sarah'));
    await gym.privateSession('Lisa Smit', '11:00', gym.trainer('Sarah'));
    const t = copy.workspaceDashboard;
    await page.goto(`/w/${gym.slug}`);

    await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
    const tiles = page.getByRole('list', { name: t.kpiLabel });
    await expect(tiles.getByRole('listitem')).toHaveCount(1);
    await expect(tiles).toContainText(t.sessionsToday);
    await expect(tiles).toContainText(`/2`);
    await expect(inMain(page).getByText(t.groupSpots)).toHaveCount(0);
    await expect(inMain(page).getByText(copy.myCalendar.typePrivate)).toHaveCount(0);
    await expect(inMain(page).getByText(copy.myCalendar.typeGroup)).toHaveCount(0);
    // Nothing needs attention: the card says so.
    await expect(inMain(page).getByText(t.attentionNone)).toBeVisible();
    await expectNoAxeViolations(page, `the private-only Dashboard in ${appLocale}`);

    await page.setViewportSize(PHONE);
    await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
    // The lanes scroll inside their card; the page itself does not scroll sideways.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expectNoAxeViolations(page, `the private-only Dashboard on a phone in ${appLocale}`);
  });

  test('Design: a solo PT’s Dashboard has no Mijn dag toggle, and an empty day says so with the actions to plan', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const gym = await team(page, context, []);
    const t = copy.workspaceDashboard;
    await page.goto(`/w/${gym.slug}`);

    await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
    await expect(page.getByRole('navigation', { name: t.scopeLabel })).toHaveCount(0);
    // Nor on Mijn dag, where the sidebar still leads back to the Dashboard.
    await page.goto('/me/day');
    await expect(page.getByRole('heading', { level: 1, name: copy.myDay.title })).toBeVisible();
    await expect(page.getByRole('navigation', { name: t.scopeLabel })).toHaveCount(0);
    await expect(
      page
        .getByRole('navigation', { name: copy.workspaceNav.label })
        .getByRole('link', { name: copy.workspaceNav.dashboard }),
    ).toBeVisible();
    await page.goto(`/w/${gym.slug}`);
    // An empty day: the text and the two ways to plan something, no tiles or lanes.
    await expect(inMain(page).getByText(t.emptyDay.replace('{workspace}', GYM))).toBeVisible();
    const main = page.getByRole('main');
    await expect(
      main.getByRole('button', { name: copy.workspaceCalendar.newPrivate }),
    ).toBeVisible();
    await expect(main.getByRole('button', { name: copy.workspaceCalendar.newGroup })).toBeVisible();
    await expect(page.getByRole('list', { name: t.kpiLabel })).toHaveCount(0);
    await expect(inMain(page).getByText(t.attentionNone)).toBeVisible();
    await expectNoAxeViolations(page, `the empty Dashboard in ${appLocale}`);
    await page.setViewportSize(PHONE);
    await expectNoAxeViolations(page, `the empty Dashboard on a phone in ${appLocale}`);
  });

  test('Trainer nodig: a class date and a private session without a trainer are listed with Toewijzen, and a row is gone once a trainer is assigned', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const gym = await team(page, context, ['sarah']);
    const t = copy.workspaceDashboard;
    const { fill } = wording(appLocale);
    const date = inDays(3);
    const privateId = await gym.privateSession(
      'Anna de Vries',
      '09:00',
      gym.trainer('Sarah'),
      date,
    );
    const boxing = await gym.classOf('Boxing', gym.trainer('Sarah'), {
      localDate: date,
      localStart: '19:15',
    });
    await page.goto(`/w/${gym.slug}`);
    // Sarah is a trainer: with both sessions of hers, nothing needs attention yet.
    await expect(inMain(page).getByText(t.attentionNone)).toBeVisible();

    // Sarah leaves the team: her profile goes and with it the trainer of both sessions.
    await leaveTeam(gym.sarah, gym.slug);
    await page.reload();
    const text = (name: string, time: string) =>
      fill(t.attentionNoTrainer)
        .replace('{name}', name)
        .replace('{date}', shortDay(date, appLocale))
        .replace('{time}', time);
    const classRow = text('Boxing', '19:15');
    const privateRow = text(`${copy.myCalendar.typePrivate} · Anna de Vries`, '09:00');
    await expect(inMain(page).getByText(classRow, { exact: true })).toBeVisible();
    await expect(inMain(page).getByText(privateRow, { exact: true })).toBeVisible();
    const assign = page.getByRole('link', { name: t.assign });
    await expect(assign).toHaveCount(2);
    await expect(
      page.getByRole('link', { name: t.assignLabel.replace('{item}', privateRow) }),
    ).toHaveAttribute('href', new RegExp(`/sessions/${privateId}$`));
    await expect(
      page.getByRole('link', { name: t.assignLabel.replace('{item}', classRow) }),
    ).toHaveAttribute('href', new RegExp(`/sessions/${boxing.firstDate.id}$`));
    await expectNoAxeViolations(page, `Aandacht nodig with two rows in ${appLocale}`);

    // The data path: the rows are what the day route answers.
    const answer = (await (
      await page.request.get(`/api/v1/workspaces/${gym.workspaceId}/day`)
    ).json()) as { attention: { id: string }[] };
    expect(answer.attention.map((item) => item.id).sort()).toEqual(
      [privateId, boxing.firstDate.id].sort(),
    );

    // Toewijzen opens the item: the class date's page (CO-01).
    await page.getByRole('link', { name: t.assignLabel.replace('{item}', classRow) }).click();
    await expect(page).toHaveURL(
      new RegExp(`/classes/${boxing.groupClass.id}/${boxing.firstDate.id}$`),
    );

    // Once a trainer is assigned the row is gone.
    await assignTrainer(boxing.firstDate.id, gym.john);
    await page.goto(`/w/${gym.slug}`);
    await expect(inMain(page).getByText(classRow, { exact: true })).toHaveCount(0);
    await expect(inMain(page).getByText(privateRow, { exact: true })).toBeVisible();
    await assignTrainer(privateId, gym.john);
    await page.reload();
    await expect(inMain(page).getByText(privateRow, { exact: true })).toHaveCount(0);
    await expect(inMain(page).getByText(t.attentionNone)).toBeVisible();
  });
});
