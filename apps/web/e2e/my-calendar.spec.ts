import type { Browser, BrowserContext, Page } from '@playwright/test';
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

// F013 (spec #457, ticket #523): *Mijn agenda* / *My calendar* on the web. Copy comes from the
// catalogs. Each spec has accounts and workspaces of its own (see language.spec.ts): Sarah is a
// Trainer of John's Gym and the Owner of Sarah Personal Training; Tom is a Trainer of John's Gym
// only; John owns John's Gym (and trains). The clients are synthetic: Anna de Vries (Sarah
// Personal Training) and Mark Jansen (John's Gym). Sarah's day is today in Dutch time: Anna 09:00,
// Mark 11:00, the class "Kracht" at 15:00 and, cancelled, at 18:00.
const GYM = "John's Gym";
const PERSONAL = 'Sarah Personal Training';
const PHONE = { width: 390, height: 844 };

/** Today in Dutch time, `YYYY-MM-DD`. */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date());
}

interface Seeded {
  sarah: string;
  gymSlug: string;
  personalSlug: string;
  gymId: string;
  personalId: string;
  anna: { id: string; sessionId: string };
  mark: { id: string; sessionId: string };
  kracht: { sessionId: string };
  krachtCancelled: { sessionId: string };
}

test.describe('F013 Mijn agenda on the web', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  async function workspaceId(page: Page, name: string): Promise<string> {
    const workspaces = (await (await page.request.get('/api/v1/me/workspaces')).json()) as {
      workspaceId: string;
      name: string;
    }[];
    const id = workspaces.find((workspace) => workspace.name === name)?.workspaceId;
    if (!id) throw new Error(`No workspace ${name}.`);
    return id;
  }

  /** A client and a private session with them today, planned through the API as the signed-in trainer does. */
  async function plan(page: Page, workspace: string, name: string, start: string) {
    const created = await page.request.post(`/api/v1/workspaces/${workspace}/clients`, {
      data: { name, email: `${name.split(' ')[0]?.toLowerCase()}@example.com` },
    });
    expect(created.status()).toBe(201);
    const id = ((await created.json()) as { id: string }).id;
    const response = await page.request.post(`/api/v1/workspaces/${workspace}/sessions/private`, {
      data: {
        clientId: id,
        localDate: today(),
        localStart: start,
        durationMinutes: 60,
        notify: false,
      },
    });
    expect(response.status()).toBe(201);
    return { id, sessionId: ((await response.json()) as { session: { id: string } }).session.id };
  }

  /** John plans the class "Kracht" with Sarah as its trainer, at 15:00 and at 18:00 (cancelled), as the Owner does. */
  async function johnPlansKracht(browser: Browser, john: string, gymId: string) {
    const baseURL = test.info().project.use.baseURL;
    const context = await browser.newContext({
      baseURL,
      extraHTTPHeaders: clientIpHeaders(),
    });
    try {
      await signInWithSession(context, john);
      const trainers = (await (
        await context.request.get(`/api/v1/workspaces/${gymId}/trainers`)
      ).json()) as { id: string; name: string }[];
      const sarah = trainers.find((trainer) => trainer.name === 'Sarah');
      if (!sarah) throw new Error('Sarah is not a trainer of the workspace.');
      const created = await context.request.post(`/api/v1/workspaces/${gymId}/group-classes`, {
        data: {
          nameNl: 'Kracht',
          capacity: 8,
          durationMinutes: 60,
          trainerId: sarah.id,
          firstDate: { localDate: today(), localStart: '15:00' },
        },
      });
      expect(created.status()).toBe(201);
      const body = (await created.json()) as {
        groupClass: { id: string };
        firstDate: { id: string };
      };
      const evening = await context.request.post(
        `/api/v1/workspaces/${gymId}/group-classes/${body.groupClass.id}/dates`,
        { data: { localDate: today(), localStart: '18:00' } },
      );
      expect(evening.status()).toBe(201);
      const cancelledId = ((await evening.json()) as { id: string }).id;
      await cancelSession(cancelledId);
      return {
        kracht: { sessionId: body.firstDate.id },
        krachtCancelled: { sessionId: cancelledId },
      };
    } finally {
      await context.close();
    }
  }

  /** Sarah, signed in, with Tuesday's shape on today: two workspaces, two clients, a class and a cancelled one. */
  async function sarahsDay(page: Page, context: BrowserContext, browser: Browser): Promise<Seeded> {
    const john = newAddress('john');
    const sarah = newAddress('sarah');
    await createAccount(john, undefined, 'John');
    await createAccount(sarah, undefined, 'Sarah');
    const gymSlug = await createGymWithTrainer(john, GYM, 'owner');
    await joinTeam(sarah, gymSlug, 'trainer');
    const personalSlug = await createGymWithTrainer(sarah, PERSONAL, 'owner');
    await signInWithSession(context, sarah);
    await page.goto('/me/day');
    const gymId = await workspaceId(page, GYM);
    const personalId = await workspaceId(page, PERSONAL);
    const anna = await plan(page, personalId, 'Anna de Vries', '09:00');
    const mark = await plan(page, gymId, 'Mark Jansen', '11:00');
    const classes = await johnPlansKracht(browser, john, gymId);
    return { sarah, gymSlug, personalSlug, gymId, personalId, anna, mark, ...classes };
  }

  /** The session links of the calendar (the blocks of the grid, or the rows of the list). */
  const sessions = (page: Page) => page.getByRole('main').locator('a[href*="/sessions/"]');

  test('AC10: every block starts with its type, the legend names the types and the filters work', async ({
    page,
    context,
    browser,
    appLocale,
    messages: copy,
  }) => {
    // Two workspaces, a class and several checks: slow on a machine that other builds load.
    test.slow();
    const day = await sarahsDay(page, context, browser);
    const t = copy.myCalendar;
    await page.goto('/me/calendar');

    // At desktop width the week is the view.
    await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
    await expect(page.getByRole('button', { name: t.viewWeek, pressed: true })).toBeVisible();
    await expect(sessions(page)).toHaveCount(4);

    // The type first, then the name, then the time, the workspace and the status.
    const names = await sessions(page).evaluateAll((links) =>
      links.map((link) => link.getAttribute('aria-label')),
    );
    expect(names).toEqual([
      expect.stringMatching(
        new RegExp(`^${t.typePrivate} · Anna de Vries, .*09:00.*10:00.*${PERSONAL}$`),
      ),
      expect.stringMatching(new RegExp(`^${t.typePrivate} · Mark Jansen, .*11:00.*12:00.*${GYM}$`)),
      expect.stringMatching(new RegExp(`^${t.typeGroup} · Kracht, .*15:00.*16:00.*${GYM}$`)),
      expect.stringMatching(
        new RegExp(`^${t.typeGroup} · Kracht, .*18:00.*19:00.*${GYM}, ${t.cancelled}$`),
      ),
    ]);
    const anna = sessions(page).filter({ hasText: 'Anna de Vries' });
    await expect(anna).toHaveAccessibleName(new RegExp(`^${t.typePrivate} · `));
    await expect(anna).toContainText(t.typePrivate);
    await expect(anna).toContainText(PERSONAL);
    await expect(anna).toHaveAttribute(
      'href',
      `/w/${day.personalSlug}/sessions/${day.anna.sessionId}`,
    );
    const kracht = sessions(page).filter({ hasText: t.typeGroup }).first();
    await expect(kracht).toContainText(
      t.blockBooked.replace('{booked}', '0').replace('{capacity}', '8'),
    );
    // The cancelled block says so, struck through.
    const cancelled = page.locator(`a[href$="/sessions/${day.krachtCancelled.sessionId}"]`);
    await expect(cancelled).toContainText(t.cancelled);
    await expect(cancelled.getByText(`${t.typeGroup} · Kracht`)).toHaveCSS(
      'text-decoration-line',
      'line-through',
    );

    // The data path: the grid is what the API answers.
    const answer = (await (
      await page.request.get(`/api/v1/me/sessions?from=${today()}&to=${today()}`)
    ).json()) as { items: { sessionId: string }[] };
    expect(answer.items.map((item) => item.sessionId).sort()).toEqual(
      [
        day.anna.sessionId,
        day.mark.sessionId,
        day.kracht.sessionId,
        day.krachtCancelled.sessionId,
      ].sort(),
    );

    // The legend names the types in words; Open Gym comes later, so it is nowhere.
    const legend = page.getByRole('list', { name: t.legend });
    await expect(legend).toContainText(t.typePrivate);
    await expect(legend).toContainText(t.typeGroup);
    await expect(page.getByText('Open Gym')).toHaveCount(0);
    // The browser is in the Netherlands: no hint about Dutch time.
    await expect(page.getByText(copy.personal.timeZoneHint)).toHaveCount(0);
    await expectNoAxeViolations(page, `Mijn agenda week in ${appLocale}`);

    const option = (name: string) => page.getByRole('checkbox', { name, exact: true });
    // Type: only Groepsles leaves the two Kracht blocks.
    await option(t.optionPrivate).uncheck();
    await expect(sessions(page)).toHaveCount(2);
    await expect(sessions(page).filter({ hasText: 'Kracht' })).toHaveCount(2);
    // Geannuleerde tonen off hides the cancelled one.
    await option(t.showCancelled).uncheck();
    await expect(sessions(page)).toHaveCount(1);
    await option(t.showCancelled).check();
    await option(t.optionPrivate).check();
    await expect(sessions(page)).toHaveCount(4);
    // Werkruimte: only Sarah Personal Training leaves Anna.
    await option(GYM).uncheck();
    await expect(sessions(page)).toHaveCount(1);
    await expect(sessions(page)).toContainText('Anna de Vries');

    // Remembered in this browser.
    await page.reload();
    await expect(option(GYM)).not.toBeChecked();
    await expect(sessions(page)).toHaveCount(1);

    // Everything filtered out: the words and Filters wissen.
    await option(PERSONAL).uncheck();
    await expect(page.getByText(t.noResults)).toBeVisible();
    await expect(sessions(page)).toHaveCount(0);
    await expectNoAxeViolations(page, `Mijn agenda without results in ${appLocale}`);
    await page.getByRole('button', { name: t.clearFilters }).click();
    await expect(sessions(page)).toHaveCount(4);
    await expect(option(GYM)).toBeChecked();
    await page.reload();
    await expect(option(GYM)).toBeChecked();
  });

  test('AC10: the day view has a column per workspace, the list is a real table and a move keeps the view', async ({
    page,
    context,
    browser,
    messages: copy,
  }) => {
    const day = await sarahsDay(page, context, browser);
    const t = copy.myCalendar;
    await page.goto('/me/calendar');

    await page.getByRole('button', { name: t.viewDay }).click();
    await expect(page.getByRole('button', { name: t.viewDay, pressed: true })).toBeVisible();
    await expect(sessions(page)).toHaveCount(4);
    const grid = page.getByRole('region', { name: new RegExp(`^${t.gridDay.split('{')[0]}`) });
    await expect(grid).toContainText(GYM);
    await expect(grid).toContainText(PERSONAL);

    await page.getByRole('button', { name: t.viewList }).click();
    const table = page.getByRole('table', { name: new RegExp(`^${t.listCaption.split('{')[0]}`) });
    await expect(table).toBeVisible();
    for (const column of [
      t.columnDay,
      t.columnTime,
      t.columnSession,
      t.columnType,
      t.columnWorkspace,
      t.columnStatus,
    ]) {
      await expect(table.getByRole('columnheader', { name: column })).toBeVisible();
    }
    await expect(table.getByRole('row')).toHaveCount(5);
    await expect(table.getByRole('link', { name: 'Mark Jansen' })).toHaveAttribute(
      'href',
      `/w/${day.gymSlug}/sessions/${day.mark.sessionId}`,
    );

    // Next week, in the view that was chosen; nothing is planned there.
    await page.getByRole('link', { name: t.next }).click();
    await expect(page).toHaveURL(/view=list/);
    await expect(page.getByText(t.emptyWeek)).toBeVisible();
    await page.getByRole('link', { name: t.today }).click();
    await expect(sessions(page)).toHaveCount(4);
  });

  test('AC10: at 390 px the list is the default, without horizontal scrolling', async ({
    page,
    context,
    browser,
    appLocale,
    messages: copy,
  }) => {
    await sarahsDay(page, context, browser);
    await page.setViewportSize(PHONE);
    await page.goto('/me/calendar');

    await expect(
      page.getByRole('button', { name: copy.myCalendar.viewList, pressed: true }),
    ).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(sessions(page)).toHaveCount(4);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal scroll').toBeLessThanOrEqual(0);
    await expectNoAxeViolations(page, `Mijn agenda at 390 px in ${appLocale}`);

    // The day view, a column per workspace, fits the phone too: no sideways scroll.
    await page.getByRole('button', { name: copy.myCalendar.viewDay }).click();
    await expect(
      page.getByRole('button', { name: copy.myCalendar.viewDay, pressed: true }),
    ).toBeVisible();
    const dayOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(dayOverflow, 'horizontal scroll in the day view').toBeLessThanOrEqual(0);
  });

  test('AC11: Sarah plans an own private session with the Workspace field; the clients follow it', async ({
    page,
    context,
    browser,
    appLocale,
    messages: copy,
  }) => {
    // Two workspaces, a class and several checks: slow on a machine that other builds load.
    test.slow();
    const day = await sarahsDay(page, context, browser);
    const form = copy.sessions.form;
    await page.goto('/me/calendar');
    await expect(sessions(page)).toHaveCount(4);

    await page.getByRole('button', { name: copy.workspaceNav.new, exact: true }).click();
    await page
      .getByRole('button', { name: copy.workspaceNav.newPrivateSession, exact: true })
      .click();
    const panel = page.getByRole('dialog', { name: form.title });
    await expect(panel).toBeVisible();

    // Werkruimte comes first, with both of Sarah's workspaces.
    const workspace = panel.getByRole('combobox', { name: form.workspaceLabel });
    await expect(workspace).toBeVisible();
    await expect(workspace.getByRole('option')).toHaveText([GYM, PERSONAL]);
    // ... and it is the first field of the form.
    await expect(panel.locator('select, input').first()).toHaveAttribute('name', 'workspaceId');

    // John's Gym first: Mark is its client, and Anna is not.
    await expect(panel.getByText(form.location.replace('{name}', GYM))).toBeVisible();
    await panel.getByRole('searchbox').fill('a');
    await expect(panel.getByRole('button', { name: /Mark Jansen/ })).toBeVisible();
    await expect(panel.getByRole('button', { name: /Anna de Vries/ })).toHaveCount(0);

    // Sarah Personal Training: the location and the clients follow; Anna is its client.
    await workspace.selectOption({ label: PERSONAL });
    await expect(panel.getByText(form.location.replace('{name}', PERSONAL))).toBeVisible();
    await panel.getByRole('searchbox').fill('a');
    await expect(panel.getByRole('button', { name: /Anna de Vries/ })).toBeVisible();
    await expect(panel.getByRole('button', { name: /Mark Jansen/ })).toHaveCount(0);
    await expectNoAxeViolations(page, `PS-01 with Werkruimte in ${appLocale}`);

    await panel.getByRole('button', { name: /Anna de Vries/ }).click();
    await panel.getByLabel(form.dateLabel).fill(today());
    await panel.getByLabel(form.startLabel).fill('13:00');
    await panel.getByRole('button', { name: form.save }).click();
    await expect(page.getByRole('status')).toContainText('Anna de Vries');

    // The saved session is in Mijn agenda, in Sarah Personal Training, and in the API's list.
    await expect(sessions(page)).toHaveCount(5);
    const planned = page.locator('a[href*="/sessions/"][aria-label*="13:00"]');
    await expect(planned).toHaveCount(1);
    await expect(planned).toHaveAttribute('href', new RegExp(`^/w/${day.personalSlug}/sessions/`));
    await expect(planned).toHaveAccessibleName(
      new RegExp(`^${copy.myCalendar.typePrivate} · Anna de Vries, `),
    );
    const answer = (await (
      await page.request.get(`/api/v1/me/sessions?from=${today()}&to=${today()}`)
    ).json()) as { items: { clientName?: string; startsAt: string; workspace: { id: string } }[] };
    const stored = answer.items.filter((item) => item.workspace.id === day.personalId);
    expect(stored.map((item) => item.clientName)).toEqual(['Anna de Vries', 'Anna de Vries']);
  });

  test('AC11: Tom, with one workspace, sees the Workspace field as a plain line', async ({
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
    await page.goto('/me/calendar');
    const form = copy.sessions.form;

    await page.getByRole('button', { name: copy.workspaceNav.new, exact: true }).click();
    await page
      .getByRole('button', { name: copy.workspaceNav.newPrivateSession, exact: true })
      .click();
    const panel = page.getByRole('dialog', { name: form.title });

    await expect(panel.getByText(form.workspaceLabel, { exact: true })).toBeVisible();
    await expect(panel.getByText(GYM, { exact: true })).toBeVisible();
    await expect(panel.getByRole('combobox', { name: form.workspaceLabel })).toHaveCount(0);
    // One workspace: no filter by workspace either.
    await panel.getByRole('button', { name: form.cancel }).click();
    await expect(page.getByRole('checkbox', { name: copy.myCalendar.optionPrivate })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: GYM })).toHaveCount(0);
  });

  test('AC12: an Owner who does not train has no Mijn agenda', async ({ page, context }) => {
    const john = newAddress('john');
    await createAccount(john, undefined, 'John');
    const slug = await createGymWithTrainer(john, GYM, 'owner', false);
    await signInWithSession(context, john);

    await page.goto('/me/calendar');

    await expect(page).toHaveURL(`/w/${slug}`);
  });

  test.describe('AC14: Mijn agenda in Dutch time', () => {
    test.use({ timezoneId: 'America/New_York' });

    test('a browser in New York sees Amsterdam times and the hint', async ({
      page,
      context,
      browser,
      messages: copy,
    }) => {
      await sarahsDay(page, context, browser);
      await page.goto('/me/calendar');

      await expect(page.getByText(copy.personal.timeZoneHint)).toBeVisible();
      const anna = sessions(page).filter({ hasText: 'Anna de Vries' });
      await expect(anna).toHaveAccessibleName(/09:00.*10:00/);
      await page.getByRole('button', { name: copy.myCalendar.viewList }).click();
      await expect(page.getByRole('table').getByText('09:00–10:00')).toBeVisible();
    });
  });
});
