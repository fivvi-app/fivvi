import { formattingLocales } from '@fivvi/i18n';
import type { Page } from '@playwright/test';
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

// F013 (spec #457, ticket #522): *Mijn dag* / *My day* on the web, the Trainer's home. Copy comes
// from the catalogs. Each spec has accounts and workspaces of its own (see language.spec.ts):
// Sarah is a Trainer of John's Gym and the Owner of Sarah Personal Training; Tom is a Trainer of
// John's Gym only; John owns John's Gym. The clients are synthetic: Anna de Vries (Sarah Personal
// Training) and Mark Jansen (John's Gym). Today is the day in Dutch time when the spec runs.
const GYM = "John's Gym";
const PERSONAL = 'Sarah Personal Training';
const PHONE = { width: 390, height: 844 };

/** Today in Dutch time, `YYYY-MM-DD`: the day *Mijn dag* shows. */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date());
}

interface PlannedSession {
  id: string;
}

test.describe('F013 Mijn dag on the web', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  /** The workspace ID of `name`, from the API of the signed-in page. */
  async function workspaceId(page: Page, name: string): Promise<string> {
    const workspaces = (await (await page.request.get('/api/v1/me/workspaces')).json()) as {
      workspaceId: string;
      name: string;
    }[];
    const id = workspaces.find((workspace) => workspace.name === name)?.workspaceId;
    if (!id) throw new Error(`No workspace ${name}.`);
    return id;
  }

  /** A client and a private session with them, planned through the API as the signed-in trainer does (today unless `date`). */
  async function plan(
    page: Page,
    workspace: string,
    client: string,
    start: string,
    date = today(),
  ) {
    const created = await page.request.post(`/api/v1/workspaces/${workspace}/clients`, {
      data: { name: client, email: `${client.split(' ')[0]?.toLowerCase()}@example.com` },
    });
    expect(created.status()).toBe(201);
    const clientId = ((await created.json()) as { id: string }).id;
    return { clientId, ...(await planWith(page, workspace, clientId, start, date)) };
  }

  async function planWith(
    page: Page,
    workspace: string,
    clientId: string,
    start: string,
    date = today(),
  ): Promise<PlannedSession> {
    const response = await page.request.post(`/api/v1/workspaces/${workspace}/sessions/private`, {
      data: { clientId, localDate: date, localStart: start, durationMinutes: 60, notify: false },
    });
    expect(response.status()).toBe(201);
    return ((await response.json()) as { session: PlannedSession }).session;
  }

  /** Sarah's day: Anna 09:00 (Sarah Personal Training), Mark 11:00 and 18:00 (John's Gym). */
  async function sarahsDay(page: Page) {
    const gym = await workspaceId(page, GYM);
    const personal = await workspaceId(page, PERSONAL);
    const anna = await plan(page, personal, 'Anna de Vries', '09:00');
    const mark = await plan(page, gym, 'Mark Jansen', '11:00');
    const evening = await planWith(page, gym, mark.clientId, '18:00');
    return { anna, mark, evening };
  }

  async function sarahOnTwoTeams(context: Parameters<typeof signInWithSession>[0]) {
    const john = newAddress('john');
    const sarah = newAddress('sarah');
    await createAccount(john, undefined, 'John');
    await createAccount(sarah, undefined, 'Sarah');
    const gymSlug = await createGymWithTrainer(john, GYM, 'owner');
    await joinTeam(sarah, gymSlug, 'trainer');
    const personalSlug = await createGymWithTrainer(sarah, PERSONAL, 'owner');
    await signInWithSession(context, sarah);
    return { john, sarah, gymSlug, personalSlug };
  }

  test("AC9: My day is the Trainer's home, lists the day across workspaces and the sidebar has Persoonlijk", async ({
    page,
    context,
    messages: copy,
  }) => {
    const { gymSlug } = await sarahOnTwoTeams(context);
    await page.goto('/home');
    // John's Gym comes first by name, and Sarah is its Trainer: her home is Mijn dag, not the workspace.
    await expect(page).toHaveURL('/me/day');
    await expect(page.getByRole('heading', { level: 1, name: copy.myDay.title })).toBeVisible();
    const { anna, mark, evening } = await sarahsDay(page);
    await page.reload();

    const nav = page.getByRole('navigation', { name: copy.workspaceNav.label });
    await expect(nav.getByText(copy.workspaceNav.personal)).toBeVisible();
    const day = nav.getByRole('link', { name: copy.workspaceNav.myDay });
    await expect(day).toHaveAttribute('aria-current', 'page');
    await expect(day).toHaveAttribute('href', '/me/day');
    await expect(nav.getByRole('link', { name: copy.workspaceNav.myCalendar })).toHaveAttribute(
      'href',
      '/me/calendar',
    );

    // The items, each in its own workspace; the workspace name because Sarah trains in two.
    const main = page.getByRole('main');
    await expect(main.getByRole('link')).toHaveCount(3);
    const row = (client: string) => main.getByRole('link', { name: new RegExp(client) });
    await expect(row('Anna de Vries')).toContainText('09:00–10:00');
    await expect(row('Anna de Vries')).toContainText(copy.myDay.typePrivate);
    await expect(row('Anna de Vries')).toContainText(PERSONAL);
    await expect(row('Anna de Vries')).toHaveAttribute(
      'href',
      new RegExp(`^/w/trainer-gym-[0-9a-f]{8}/sessions/${anna.id}$`),
    );
    await expect(row('11:00–12:00')).toContainText('Mark Jansen');
    await expect(row('11:00–12:00')).toContainText(GYM);
    await expect(row('11:00–12:00')).toHaveAttribute('href', `/w/${gymSlug}/sessions/${mark.id}`);
    await expect(row('18:00–19:00')).toContainText('Mark Jansen');
    await expect(main.getByText(/^3 \S+ · 09:00–19:00$/)).toBeVisible();

    // The data path: the page is what the API answers for the day, not a stub.
    const answer = (await (await page.request.get(`/api/v1/me/day?date=${today()}`)).json()) as {
      items: { sessionId: string }[];
      next?: { sessionId: string; state: string };
    };
    expect(answer.items.map((item) => item.sessionId)).toEqual([anna.id, mark.id, evening.id]);
    // Straks (or Nu bezig), when something is left today, is on top with the item the API names
    // and is not listed again; the others follow in time order. Which one it is depends on the hour.
    const order = answer.items.map((item) => item.sessionId);
    if (answer.next) {
      const next = answer.next.sessionId;
      order.splice(order.indexOf(next), 1);
      order.unshift(next);
      const label =
        answer.next.state === 'in_progress'
          ? copy.myDay.nextInProgress
          : new RegExp(copy.myDay.nextUpcoming.replace('{minutes}', '\\d+'));
      await expect(main.getByRole('heading', { level: 2, name: label })).toBeVisible();
    }
    const hrefs = await main
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')?.split('/').pop()));
    expect(hrefs).toEqual(order);

    // Change the row and the screen changes: a cancelled session stays, struck through, with its word.
    await expect(main.getByText(copy.myDay.cancelled)).toHaveCount(0);
    await cancelSession(evening.id);
    await page.reload();
    const cancelled = page.getByRole('link', { name: new RegExp(copy.myDay.cancelled) });
    await expect(cancelled).toHaveCount(1);
    await expect(cancelled).toHaveAttribute('href', `/w/${gymSlug}/sessions/${evening.id}`);
    await expect(cancelled.getByText('Mark Jansen')).toHaveCSS(
      'text-decoration-line',
      'line-through',
    );
  });

  test('AC9: at 390 px the page is one column without horizontal scrolling and with touch-sized rows', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    await sarahOnTwoTeams(context);
    await page.setViewportSize(PHONE);
    await page.goto('/home');
    await expect(page).toHaveURL('/me/day');
    await sarahsDay(page);
    await page.reload();

    const main = page.getByRole('main');
    await expect(main.getByRole('link')).toHaveCount(3);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal scroll').toBeLessThanOrEqual(0);
    const boxes = await main.getByRole('link').evaluateAll((rows) =>
      rows.map((row) => {
        const { x, y, width, height } = row.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
    for (const box of boxes) {
      expect(box.height, 'a row is at least 44 px high').toBeGreaterThanOrEqual(44);
      expect(box.x, 'a row stays inside the screen').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
    }
    // One column: the rows sit below one another.
    for (const [index, box] of boxes.entries()) {
      if (index > 0) expect(box.y).toBeGreaterThan(boxes[index - 1]?.y ?? 0);
    }
    // The sidebar links are touch-sized too.
    const nav = page.getByRole('navigation', { name: copy.workspaceNav.label });
    const link = await nav
      .getByRole('link', { name: copy.workspaceNav.myDay })
      .evaluate((element) => element.getBoundingClientRect().height);
    expect(link).toBeGreaterThanOrEqual(44);
    await expectNoAxeViolations(page, `Mijn dag at 390 px in ${appLocale}`);
  });

  test('AC4: a row opens the session in its workspace', async ({
    page,
    context,
    messages: copy,
  }) => {
    const { gymSlug } = await sarahOnTwoTeams(context);
    await page.goto('/me/day');
    const { mark } = await sarahsDay(page);
    await page.reload();

    await page.getByRole('link', { name: /Mark Jansen.*11:00|11:00.*Mark Jansen/ }).click();

    await expect(page).toHaveURL(`/w/${gymSlug}/sessions/${mark.id}`);
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: copy.sessions.page.heading.replace('{client}', 'Mark Jansen'),
      }),
    ).toBeVisible();
  });

  test('AC2: with one workspace a row names no workspace', async ({
    page,
    context,
    messages: copy,
  }) => {
    const john = newAddress('john');
    const tom = newAddress('tom');
    await createAccount(john, undefined, 'John');
    await createAccount(tom, undefined, 'Tom');
    const slug = await createGymWithTrainer(john, GYM, 'owner');
    await joinTeam(tom, slug, 'trainer');
    await signInWithSession(context, tom);
    await page.goto('/me/day');
    await plan(page, await workspaceId(page, GYM), 'Mark Jansen', '11:00');
    await page.reload();

    const row = page.getByRole('main').getByRole('link');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Mark Jansen');
    // The location is called like the workspace here, so only a line of its own would be the workspace's name.
    await expect(row.getByText(GYM, { exact: true })).toHaveCount(0);
    await expect(row).toContainText(`${copy.myDay.typePrivate} · ${GYM}`);
  });

  test('AC5: an empty day says so, with the date of the next session and, for a new trainer, no sessions yet', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const john = newAddress('john');
    const tom = newAddress('tom');
    await createAccount(john, undefined, 'John');
    await createAccount(tom, undefined, 'Tom');
    const slug = await createGymWithTrainer(john, GYM, 'owner');
    await joinTeam(tom, slug, 'trainer');
    await signInWithSession(context, tom);

    await page.goto('/me/day');
    await expect(page.getByText(copy.myDay.emptyNever)).toBeVisible();
    await expect(page.getByText(copy.myDay.summaryNone, { exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByRole('link')).toHaveCount(0);

    // A session in three days: nothing today or tomorrow, so the line names its date.
    const later = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(later);
    await plan(page, await workspaceId(page, GYM), 'Mark Jansen', '11:00', date);
    await page.reload();
    const shown = new Intl.DateTimeFormat(formattingLocales[appLocale], {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(`${date}T12:00:00Z`));
    await expect(page.getByText(copy.myDay.emptyNext.replace('{date}', shown))).toBeVisible();
  });

  test('AC12: without a trainer profile there are no personal pages', async ({
    page,
    context,
    messages: copy,
  }) => {
    const john = newAddress('john');
    await createAccount(john, undefined, 'John');
    // The Owner who does not train: no trainer profile in John's Gym.
    const slug = await createGymWithTrainer(john, GYM, 'owner', false);
    await signInWithSession(context, john);

    await page.goto(`/w/${slug}`);
    const nav = page.getByRole('navigation', { name: copy.workspaceNav.label });
    await expect(nav.getByRole('link', { name: copy.workspaceNav.clients })).toBeVisible();
    await expect(page.getByText(copy.workspaceNav.personal)).toHaveCount(0);
    await expect(nav.getByRole('link', { name: copy.workspaceNav.myDay })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: copy.workspaceNav.myCalendar })).toHaveCount(0);

    // The page itself is not there either: the person goes to the workspace's home, the Owner's.
    await page.goto('/me/day');
    await expect(page).toHaveURL(`/w/${slug}`);
    const list = await page.request.get(`/api/v1/me/sessions?from=${today()}&to=${today()}`);
    expect(await list.json()).toMatchObject({ items: [], workspaceCount: 0 });
  });

  test('AC13: a client account sees the no-access state on My day, and no sessions from the API', async ({
    page,
    context,
    messages: copy,
  }) => {
    const lisa = newAddress('lisa');
    await createAccount(lisa, undefined, 'Lisa');
    await signInWithSession(context, lisa);

    await page.goto('/me/day');

    await expect(page).toHaveURL('/me/day');
    await expect(page.getByRole('heading', { level: 1, name: copy.noAccess.title })).toBeVisible();
    await expect(page.getByText(copy.noAccess.body)).toBeVisible();
    await expect(page.getByRole('navigation', { name: copy.workspaceNav.label })).toHaveCount(0);
    const list = await page.request.get(`/api/v1/me/sessions?from=${today()}&to=${today()}`);
    expect(await list.json()).toMatchObject({ items: [] });
  });
});
