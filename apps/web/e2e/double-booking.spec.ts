import { type Messages, trainerWordForms } from '@fivvi/i18n';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  joinTeam,
  newAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';

// F023 (spec #459, ticket #538): PS-07 *Dubbele boeking*, the soft warning on the web forms: PS-01
// *Nieuwe privésessie*, PS-05 *Verplaatsen*, *Op een datum plannen* and CO-04 *Wijzigen*. Copy comes
// from the catalogs. Each spec has accounts and workspaces of its own (see language.spec.ts): John
// owns John's Gym (and trains), Sarah and Tom are Trainers there. Synthetic people: Mark Jansen and
// Anna de Vries are the clients. Dates are relative to the day the spec runs.
const GYM = "John's Gym";

interface SessionBody {
  id: string;
  version: number;
  startsAt: string;
  endsAt: string;
  trainer?: { id: string; name: string };
}

/** The `YYYY-MM-DD` of a Thursday between three and four weeks ahead. */
function thursday(): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 21);
  day.setUTCDate(day.getUTCDate() + ((4 - day.getUTCDay() + 7) % 7));
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

test.describe('F023 PS-07 double booking on the web', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  /** John (Owner, trains), Sarah and Tom (Trainers) of John's Gym. */
  async function team() {
    const john = newAddress('john');
    const sarah = newAddress('sarah');
    const tom = newAddress('tom');
    await createAccount(john, undefined, 'John');
    await createAccount(sarah, undefined, 'Sarah');
    await createAccount(tom, undefined, 'Tom');
    const slug = await createGymWithTrainer(john, GYM, 'owner');
    await joinTeam(sarah, slug, 'trainer');
    await joinTeam(tom, slug, 'trainer');
    return { john, sarah, tom, slug };
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

  async function seedClient(request: APIRequestContext, workspaceId: string, name: string) {
    const response = await request.post(`/api/v1/workspaces/${workspaceId}/clients`, {
      data: { name, email: newAddress(name.split(' ')[0]?.toLowerCase() ?? 'client') },
    });
    expect(response.status()).toBe(201);
    return (await response.json()) as { id: string; name: string };
  }

  /** Plans a private session through the API, as the data a spec starts from. */
  async function seedSession(
    request: APIRequestContext,
    workspaceId: string,
    data: Record<string, unknown>,
  ): Promise<SessionBody> {
    const response = await request.post(`/api/v1/workspaces/${workspaceId}/sessions/private`, {
      data: { durationMinutes: 60, notify: false, localDate: thursday(), ...data },
    });
    expect(response.status()).toBe(201);
    return ((await response.json()) as { session: SessionBody }).session;
  }

  /** How many upcoming private sessions `clientId` has: what is stored. */
  async function upcomingCount(request: APIRequestContext, workspaceId: string, clientId: string) {
    const response = await request.get(
      `/api/v1/workspaces/${workspaceId}/clients/${clientId}/upcoming-sessions`,
    );
    expect(response.status()).toBe(200);
    return ((await response.json()) as { sessions: unknown[] }).sessions.length;
  }

  async function storedSession(request: APIRequestContext, workspaceId: string, id: string) {
    const response = await request.get(`/api/v1/workspaces/${workspaceId}/sessions/${id}`);
    expect(response.status()).toBe(200);
    return (await response.json()) as SessionBody;
  }

  /** Opens PS-01 from the top bar's + Nieuw. */
  async function openPanel(page: Page, copy: Messages) {
    await page.getByRole('button', { name: copy.workspaceNav.new, exact: true }).click();
    await page
      .getByRole('button', { name: copy.workspaceNav.newPrivateSession, exact: true })
      .click();
    const panel = page.getByRole('dialog', { name: copy.sessions.form.title });
    await expect(panel).toBeVisible();
    return panel;
  }

  /** Fills PS-01 for Anna at `start` (and Tom, when John chooses the trainer). */
  async function fillPanel(
    panel: Locator,
    copy: Messages,
    appLocale: 'nl-NL' | 'en',
    start: string,
    trainer?: string,
  ) {
    await panel.getByRole('searchbox').fill('ann');
    await panel.getByRole('button', { name: /Anna de Vries/ }).click();
    await panel.getByLabel(copy.sessions.form.dateLabel).fill(thursday());
    await panel.getByLabel(copy.sessions.form.startLabel).fill(start);
    if (trainer) {
      await panel
        .getByRole('combobox', { name: trainerWordForms('trainer', appLocale).Word })
        .selectOption({ label: trainer });
    }
  }

  /** The line PS-07 writes for Mark's session, 09:00–10:00 on the Thursday. */
  const markLine = (copy: Messages, appLocale: 'nl-NL' | 'en') => {
    const day = new Intl.DateTimeFormat(appLocale === 'en' ? 'en-GB' : 'nl-NL', {
      timeZone: 'Europe/Amsterdam',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(`${thursday()}T12:00:00Z`));
    return copy.sessions.doubleBooking.item
      .replace('{date}', day)
      .replace('{start}', '09:00')
      .replace('{end}', '10:00')
      .replace('{name}', 'Mark Jansen')
      .replace('{type}', copy.sessions.doubleBooking.typePrivate);
  };

  test('AC5: John plans Anna for Tom over Mark: the warning, Terug keeps the form, Toch opslaan saves', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const tom = await trainerId(page.request, workspaceId, 'Tom');
    const mark = await seedClient(page.request, workspaceId, 'Mark Jansen');
    const markSession = await seedSession(page.request, workspaceId, {
      clientId: mark.id,
      trainerId: tom,
      localStart: '09:00',
    });
    const anna = await seedClient(page.request, workspaceId, 'Anna de Vries');
    await page.reload();

    const panel = await openPanel(page, copy);
    await fillPanel(panel, copy, appLocale, '09:30', 'Tom');
    await panel.getByRole('button', { name: copy.sessions.form.save }).click();

    const warning = page.getByRole('alertdialog', {
      name: copy.sessions.doubleBooking.title.replace('{trainer}', 'Tom'),
    });
    await expect(warning).toBeVisible();
    await expect(warning.getByText(markLine(copy, appLocale), { exact: true })).toBeVisible();
    await expect(warning.getByText(copy.sessions.doubleBooking.note)).toBeVisible();
    await expectNoAxeViolations(page, `PS-07 on PS-01 in ${appLocale}`);

    // Terug: the warning goes, the form stays as it was, and nothing is stored.
    await warning.getByRole('button', { name: copy.sessions.doubleBooking.back }).click();
    await expect(warning).toHaveCount(0);
    await expect(panel.getByLabel(copy.sessions.form.startLabel)).toHaveValue('09:30');
    await expect(panel.getByText('Anna de Vries', { exact: true })).toBeVisible();
    expect(await upcomingCount(page.request, workspaceId, anna.id)).toBe(0);

    // Toch opslaan: the same request again with allowConflicts; the snackbar names the session.
    await panel.getByRole('button', { name: copy.sessions.form.save }).click();
    await expect(warning).toBeVisible();
    await warning.getByRole('button', { name: copy.sessions.doubleBooking.saveAnyway }).click();
    await expect(page.getByRole('status')).toContainText('Anna de Vries');
    await expect(warning).toHaveCount(0);

    expect(await upcomingCount(page.request, workspaceId, anna.id)).toBe(1);

    // The data path: both sessions are stored, Mark's untouched and Anna's with Tom at 09:30.
    const href = await page
      .getByRole('link', { name: copy.sessions.form.open })
      .getAttribute('href');
    const planned = await storedSession(page.request, workspaceId, href?.split('/').pop() ?? '');
    expect(planned.trainer?.name).toBe('Tom');
    expect(clockOf(planned.startsAt)).toBe('09:30');
    expect(await storedSession(page.request, workspaceId, markSession.id)).toMatchObject({
      version: 1,
      trainer: { name: 'Tom' },
    });
  });

  test('AC5: a session at 10:00–11:00, right after Mark’s, shows no warning', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const tom = await trainerId(page.request, workspaceId, 'Tom');
    const mark = await seedClient(page.request, workspaceId, 'Mark Jansen');
    await seedSession(page.request, workspaceId, {
      clientId: mark.id,
      trainerId: tom,
      localStart: '09:00',
    });
    await seedClient(page.request, workspaceId, 'Anna de Vries');
    await page.reload();

    const panel = await openPanel(page, copy);
    await fillPanel(panel, copy, appLocale, '10:00', 'Tom');
    await panel.getByRole('button', { name: copy.sessions.form.save }).click();

    await expect(page.getByRole('status')).toContainText('Anna de Vries');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('AC6: Tom plans over his own session and hears "Je hebt dan al iets"', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { tom, slug } = await team();
    await signInWithSession(context, tom);
    // A Trainer's address of the workspace opens Mijn dag (F014), which plans in a workspace of her choice (F013): PS-01 of this workspace is opened from a page of it.
    await page.goto(`/w/${slug}/clients`);
    const workspaceId = await gymId(page.request);
    const mark = await seedClient(page.request, workspaceId, 'Mark Jansen');
    await seedClient(page.request, workspaceId, 'Anna de Vries');
    const markSession = await seedSession(page.request, workspaceId, {
      clientId: mark.id,
      localStart: '09:00',
    });
    await page.reload();

    const panel = await openPanel(page, copy);
    await fillPanel(panel, copy, appLocale, '09:30');
    await panel.getByRole('button', { name: copy.sessions.form.save }).click();

    const warning = page.getByRole('alertdialog', { name: copy.sessions.doubleBooking.titleOwn });
    await expect(warning).toBeVisible();
    await expect(warning.getByText(markLine(copy, appLocale), { exact: true })).toBeVisible();
    await expectNoAxeViolations(page, `PS-07 own wording in ${appLocale}`);

    await warning.getByRole('button', { name: copy.sessions.doubleBooking.saveAnyway }).click();
    await expect(page.getByRole('status')).toContainText('Anna de Vries');
    const href = await page
      .getByRole('link', { name: copy.sessions.form.open })
      .getAttribute('href');
    const planned = await storedSession(page.request, workspaceId, href?.split('/').pop() ?? '');
    expect(planned.trainer?.name).toBe('Tom');
    expect(clockOf(planned.startsAt)).toBe('09:30');
    expect((await storedSession(page.request, workspaceId, markSession.id)).version).toBe(1);
  });

  test('AC6: John plans and moves his own session and hears "Je hebt dan al iets", not his name', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const mark = await seedClient(page.request, workspaceId, 'Mark Jansen');
    const anna = await seedClient(page.request, workspaceId, 'Anna de Vries');
    // Mark's session is John's own: the Owner trains, and the trainer field starts on him.
    await seedSession(page.request, workspaceId, { clientId: mark.id, localStart: '09:00' });
    const annaSession = await seedSession(page.request, workspaceId, {
      clientId: anna.id,
      localStart: '11:00',
    });
    await page.reload();

    // PS-01 with the trainer field on John himself.
    const panel = await openPanel(page, copy);
    await fillPanel(panel, copy, appLocale, '09:30');
    await panel.getByRole('button', { name: copy.sessions.form.save }).click();
    const warning = page.getByRole('alertdialog', { name: copy.sessions.doubleBooking.titleOwn });
    await expect(warning).toBeVisible();
    await expect(warning.getByText(markLine(copy, appLocale), { exact: true })).toBeVisible();
    await warning.getByRole('button', { name: copy.sessions.doubleBooking.back }).click();

    // PS-05: John moves his own session onto Mark's hour.
    await page.goto(`/w/${slug}/sessions/${annaSession.id}`);
    await page.getByRole('button', { name: copy.sessions.page.reschedule }).click();
    const dialog = page.getByRole('dialog', { name: copy.sessions.reschedule.title });
    await dialog.getByLabel(copy.sessions.form.startLabel).fill('09:30');
    await dialog.getByRole('button', { name: copy.sessions.reschedule.submitNotify }).click();
    await expect(warning).toBeVisible();
    await expect(warning.getByText(markLine(copy, appLocale), { exact: true })).toBeVisible();
  });

  test('AC6: John schedules a class and changes a date with himself as the trainer: "Je hebt dan al iets"', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const johnId = await trainerId(page.request, workspaceId, 'John');
    const mark = await seedClient(page.request, workspaceId, 'Mark Jansen');
    await seedSession(page.request, workspaceId, { clientId: mark.id, localStart: '09:00' });
    const kracht = (await (
      await page.request.post(`/api/v1/workspaces/${workspaceId}/group-classes`, {
        data: { nameNl: 'Kracht', capacity: 8, durationMinutes: 60, trainerId: johnId },
      })
    ).json()) as { groupClass: { id: string } };
    const classId = kracht.groupClass.id;

    await page.goto(`/w/${slug}/classes/${classId}`);
    await page.getByRole('button', { name: copy.classes.page.schedule }).click();
    const schedule = page.getByRole('dialog', { name: copy.classes.schedule.title });
    await schedule.getByLabel(copy.classes.schedule.dateLabel, { exact: true }).fill(thursday());
    await schedule.getByLabel(copy.classes.schedule.startLabel, { exact: true }).fill('09:30');
    await schedule.getByRole('button', { name: copy.classes.schedule.save }).click();
    const warning = page.getByRole('alertdialog', { name: copy.sessions.doubleBooking.titleOwn });
    await expect(warning).toBeVisible();
    await expect(warning.getByText(markLine(copy, appLocale), { exact: true })).toBeVisible();
    await warning.getByRole('button', { name: copy.sessions.doubleBooking.saveAnyway }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${slug}/classes/${classId}/[0-9a-f-]{36}$`), {
      timeout: 15_000,
    });

    // CO-04 on that date, still John's.
    await page.getByRole('button', { name: copy.classes.date.edit }).click();
    const edit = page.getByRole('dialog', { name: copy.classes.edit.title });
    await edit.getByLabel(copy.classes.edit.startLabel, { exact: true }).fill('09:45');
    await edit.getByRole('button', { name: copy.classes.edit.save }).click();
    await expect(warning).toBeVisible();
    await expect(warning.getByText(markLine(copy, appLocale), { exact: true })).toBeVisible();
  });

  test('AC5: PS-05 moving onto Mark’s session warns; Terug keeps the form; Toch opslaan moves it on the same version', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, tom, slug } = await team();
    await signInWithSession(context, tom);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const mark = await seedClient(page.request, workspaceId, 'Mark Jansen');
    const anna = await seedClient(page.request, workspaceId, 'Anna de Vries');
    await seedSession(page.request, workspaceId, { clientId: mark.id, localStart: '09:00' });
    const annaSession = await seedSession(page.request, workspaceId, {
      clientId: anna.id,
      localStart: '11:00',
    });

    // Tom moves his own session: "Je hebt dan al iets".
    await page.goto(`/w/${slug}/sessions/${annaSession.id}`);
    await page.getByRole('button', { name: copy.sessions.page.reschedule }).click();
    const dialog = page.getByRole('dialog', { name: copy.sessions.reschedule.title });
    await dialog.getByLabel(copy.sessions.form.startLabel).fill('09:30');
    await dialog.getByRole('button', { name: copy.sessions.reschedule.submitNotify }).click();
    const warning = page.getByRole('alertdialog', { name: copy.sessions.doubleBooking.titleOwn });
    await expect(warning).toBeVisible();
    await expect(warning.getByText(markLine(copy, appLocale), { exact: true })).toBeVisible();
    await expectNoAxeViolations(page, `PS-07 on PS-05 in ${appLocale}`);

    await warning.getByRole('button', { name: copy.sessions.doubleBooking.back }).click();
    await expect(warning).toHaveCount(0);
    await expect(dialog.getByLabel(copy.sessions.form.startLabel)).toHaveValue('09:30');
    expect((await storedSession(page.request, workspaceId, annaSession.id)).version).toBe(1);

    await dialog.getByRole('button', { name: copy.sessions.reschedule.submitNotify }).click();
    await warning.getByRole('button', { name: copy.sessions.doubleBooking.saveAnyway }).click();
    await expect(dialog).toHaveCount(0);
    const moved = await storedSession(page.request, workspaceId, annaSession.id);
    expect(clockOf(moved.startsAt)).toBe('09:30');
    expect(moved.version).toBe(2);

    // John moves it again onto Mark's hour: the warning names Tom.
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}/sessions/${annaSession.id}`);
    await page.getByRole('button', { name: copy.sessions.page.reschedule }).click();
    const again = page.getByRole('dialog', { name: copy.sessions.reschedule.title });
    await again.getByLabel(copy.sessions.form.startLabel).fill('09:15');
    await again.getByRole('button', { name: copy.sessions.reschedule.submitNotify }).click();
    await expect(
      page.getByRole('alertdialog', {
        name: copy.sessions.doubleBooking.title.replace('{trainer}', 'Tom'),
      }),
    ).toBeVisible();
  });

  test('AC5: a class on a date and CO-04 warn about the trainer’s private sessions', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const tom = await trainerId(page.request, workspaceId, 'Tom');
    const mark = await seedClient(page.request, workspaceId, 'Mark Jansen');
    await seedSession(page.request, workspaceId, {
      clientId: mark.id,
      trainerId: tom,
      localStart: '09:00',
    });
    const kracht = (await (
      await page.request.post(`/api/v1/workspaces/${workspaceId}/group-classes`, {
        data: { nameNl: 'Kracht', capacity: 8, durationMinutes: 60, trainerId: tom },
      })
    ).json()) as { groupClass: { id: string } };
    const classId = kracht.groupClass.id;

    // *Op een datum plannen* at 09:30 with Tom, who has Mark then.
    await page.goto(`/w/${slug}/classes/${classId}`);
    await page.getByRole('button', { name: copy.classes.page.schedule }).click();
    const schedule = page.getByRole('dialog', { name: copy.classes.schedule.title });
    await schedule.getByLabel(copy.classes.schedule.dateLabel, { exact: true }).fill(thursday());
    await schedule.getByLabel(copy.classes.schedule.startLabel, { exact: true }).fill('09:30');
    await schedule.getByRole('button', { name: copy.classes.schedule.save }).click();
    const warning = page.getByRole('alertdialog', {
      name: copy.sessions.doubleBooking.title.replace('{trainer}', 'Tom'),
    });
    await expect(warning).toBeVisible();
    await expect(warning.getByText(markLine(copy, appLocale), { exact: true })).toBeVisible();
    await expectNoAxeViolations(page, `PS-07 on the schedule form in ${appLocale}`);
    await warning.getByRole('button', { name: copy.sessions.doubleBooking.back }).click();
    await expect(warning).toHaveCount(0);
    await expect(
      schedule.getByLabel(copy.classes.schedule.startLabel, { exact: true }),
    ).toHaveValue('09:30');
    await schedule.getByRole('button', { name: copy.classes.schedule.save }).click();
    await warning.getByRole('button', { name: copy.sessions.doubleBooking.saveAnyway }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${slug}/classes/${classId}/[0-9a-f-]{36}$`), {
      timeout: 15_000,
    });

    // CO-04: this date is 09:30–10:30; moving its start to 09:45 still overlaps Mark, and the
    // warning comes again, now from *Wijzigen*; Toch opslaan stores the new start.
    await page.getByRole('button', { name: copy.classes.date.edit }).click();
    const edit = page.getByRole('dialog', { name: copy.classes.edit.title });
    await edit.getByLabel(copy.classes.edit.startLabel, { exact: true }).fill('09:45');
    await edit.getByRole('button', { name: copy.classes.edit.save }).click();
    await expect(warning).toBeVisible();
    await expectNoAxeViolations(page, `PS-07 on CO-04 in ${appLocale}`);
    await warning.getByRole('button', { name: copy.sessions.doubleBooking.saveAnyway }).click();
    await expect(
      page.getByRole('status').filter({ hasText: copy.classes.edit.saved }),
    ).toBeVisible();
    const id = page.url().split('/').pop() ?? '';
    expect(clockOf((await storedSession(page.request, workspaceId, id)).startsAt)).toBe('09:45');
  });
});
