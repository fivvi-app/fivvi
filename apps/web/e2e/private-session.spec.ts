import { messages as catalogs, type Locale, trainerWordForms } from '@fivvi/i18n';
import type { Locator, Page } from '@playwright/test';
import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  joinTeam,
  newAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';
import { emailsTo, waitForEmail } from './lettermint';

// F020 (spec #425, ticket #444): PS-01 *Nieuwe privésessie* from + Nieuw, the session page, PS-05
// *Verplaatsen* and *Komende sessies* on the client profile. Copy comes from the catalogs. Each
// spec has accounts and workspaces of its own (see language.spec.ts): John owns John's Gym (and
// trains), Sarah and Tom are Trainers there. The clients are synthetic: Anna de Vries (emails in
// the workspace's Dutch) and Mark Jansen (emails in English). Dates are relative to the day the
// spec runs, so a planned session is always in the future; the DST days are fixed.
const GYM = "John's Gym";

interface SessionBody {
  id: string;
  version: number;
  startsAt: string;
  endsAt: string;
  trainer?: { id: string; name: string };
  location: { name: string };
  participants: { clientId: string; name: string }[];
}

/** The `YYYY-MM-DD` of a Thursday between three and four weeks ahead, plus `weeks` weeks. */
function thursday(weeks = 0): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 21 + weeks * 7);
  day.setUTCDate(day.getUTCDate() + ((4 - day.getUTCDay() + 7) % 7));
  return day.toISOString().slice(0, 10);
}

/** The next day after `date` (`YYYY-MM-DD`) that is the same weekday `days` later. */
function plusDays(date: string, days: number): string {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

test.describe('F020 private sessions on the web', () => {
  // Not `@example.com`: that mail goes to the server log, and these specs read the emails the fake
  // Lettermint server received (see newAddress).
  let annaEmail = '';
  let markEmail = '';

  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
    annaEmail = newAddress('anna');
    markEmail = newAddress('mark');
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

  async function gymId(page: Page): Promise<string> {
    const workspaces = (await (await page.request.get('/api/v1/me/workspaces')).json()) as {
      workspaceId: string;
      name: string;
    }[];
    const id = workspaces.find((workspace) => workspace.name === GYM)?.workspaceId;
    if (!id) throw new Error(`No workspace ${GYM}.`);
    return id;
  }

  async function seedClient(page: Page, workspaceId: string, data: Record<string, string>) {
    const response = await page.request.post(`/api/v1/workspaces/${workspaceId}/clients`, { data });
    expect(response.status()).toBe(201);
    return (await response.json()) as { id: string; name: string; email: string };
  }

  /** Plans a session through the API, as the data a spec starts from; `as` is the caller's request context. */
  async function seedSession(
    page: Page,
    workspaceId: string,
    data: Record<string, unknown>,
  ): Promise<SessionBody> {
    const response = await page.request.post(`/api/v1/workspaces/${workspaceId}/sessions/private`, {
      data: { durationMinutes: 60, notify: false, ...data },
    });
    expect(response.status()).toBe(201);
    return ((await response.json()) as { session: SessionBody }).session;
  }

  async function storedSession(
    page: Page,
    workspaceId: string,
    sessionId: string,
  ): Promise<SessionBody> {
    const response = await page.request.get(
      `/api/v1/workspaces/${workspaceId}/sessions/${sessionId}`,
    );
    expect(response.status()).toBe(200);
    return (await response.json()) as SessionBody;
  }

  /** Opens PS-01 from the top bar's + Nieuw. */
  async function openPanel(page: Page, copy: typeof import('@fivvi/i18n')['messages']['en']) {
    await page.getByRole('button', { name: copy.workspaceNav.new, exact: true }).click();
    await page
      .getByRole('button', { name: copy.workspaceNav.newPrivateSession, exact: true })
      .click();
    const panel = page.getByRole('dialog', { name: copy.sessions.form.title });
    await expect(panel).toBeVisible();
    return panel;
  }

  /** Searches and picks a client in PS-02. */
  async function pickClient(panel: Locator, search: string, name: string) {
    await panel.getByRole('searchbox').fill(search);
    await panel.getByRole('button', { name: new RegExp(name) }).click();
  }

  /** The wall-clock `do 24 sep` the app writes for `instant` in the reader's language. */
  const dayOf = (instant: string, appLocale: 'nl-NL' | 'en') =>
    new Intl.DateTimeFormat(appLocale === 'en' ? 'en-GB' : 'nl-NL', {
      timeZone: 'Europe/Amsterdam',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(instant));

  test('AC1: Sarah plans a session from PS-01, sees the snackbar and Openen opens the session page', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { sarah, slug } = await team();
    await signInWithSession(context, sarah);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page);
    const anna = await seedClient(page, workspaceId, {
      name: 'Anna de Vries',
      email: annaEmail,
    });
    await page.reload();
    const date = thursday();

    const panel = await openPanel(page, copy);
    // The location is a plain line and the trainer is fixed to Sarah; there is no Training field.
    await expect(panel.getByText(copy.sessions.form.location.replace('{name}', GYM))).toBeVisible();
    await expect(
      panel.getByText(copy.sessions.form.trainerMe.replace('{name}', 'Sarah')),
    ).toBeVisible();
    await expect(panel.getByRole('combobox', { name: /Trainer/ })).toHaveCount(0);
    await expectNoAxeViolations(page, `PS-01 empty in ${appLocale}`);

    await pickClient(panel, 'ann', 'Anna de Vries');
    await panel.getByLabel(copy.sessions.form.dateLabel).fill(date);
    await panel.getByLabel(copy.sessions.form.startLabel).fill('09:00');
    // 60 minutes is the first choice; the end time is shown, not asked.
    await expect(panel.getByRole('radio', { name: '60 min' })).toBeChecked();
    await expect(
      panel.getByText(copy.sessions.form.endsAt.replace('{time}', '10:00')),
    ).toBeVisible();
    // AC3: the note says the language of the email before saving; Anna follows the workspace's Dutch.
    await expect(
      panel.getByText(
        copy.sessions.form.notifyNote
          .replace('{email}', annaEmail)
          .replace('{language}', copy.sessions.form.languageNl),
      ),
    ).toBeVisible();
    await expect(
      panel.getByRole('checkbox', {
        name: copy.sessions.form.notify.replace('{client}', 'Anna de Vries'),
      }),
    ).toBeChecked();
    await expectNoAxeViolations(page, `PS-01 filled in ${appLocale}`);
    await panel.getByRole('button', { name: copy.sessions.form.save }).click();

    // The snackbar names the client, the day and the time; Openen opens the session page.
    const startsAt = `${date}T12:00:00Z`;
    await expect(page.getByRole('status')).toContainText(
      copy.sessions.form.saved
        .replace('{client}', 'Anna de Vries')
        .replace('{date}', dayOf(startsAt, appLocale))
        .replace('{time}', '09:00'),
    );
    await page.getByRole('link', { name: copy.sessions.form.open }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${slug}/sessions/[0-9a-f-]{36}$`), {
      timeout: 15_000,
    });
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: copy.sessions.page.heading.replace('{client}', 'Anna de Vries'),
      }),
    ).toBeVisible();
    const main = page.getByRole('main');
    await expect(main.getByText(GYM, { exact: true })).toBeVisible();
    await expect(main.getByText('Sarah', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Anna de Vries' })).toHaveAttribute(
      'href',
      `/w/${slug}/clients/${anna.id}`,
    );
    await expect(page).toHaveTitle(copy.sessions.title);
    await expectNoAxeViolations(page, `the session page in ${appLocale}`);

    // The data path: the API holds a private session of Sarah with Anna, 09:00 in Amsterdam.
    const id = page.url().split('/').pop() ?? '';
    const session = await storedSession(page, workspaceId, id);
    expect(session).toMatchObject({
      trainer: { name: 'Sarah' },
      location: { name: GYM },
      participants: [{ clientId: anna.id, name: 'Anna de Vries' }],
    });
    expect(new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()).toBe(
      3_600_000,
    );
    expect(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Amsterdam',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(session.startsAt)),
    ).toBe('09:00');
    // EM-11 went to Anna, in Dutch.
    const mail = await waitForEmail(annaEmail);
    expect(mail.subject.startsWith(subjectStart('nl-NL', 'privateSession'))).toBe(true);
    expect(mail.subject).toContain('09:00');
  });

  test('AC2: John’s trainer field lists every trainer and he plans for Tom; Sarah’s is fixed to her', async ({
    page,
    context,
    messages: copy,
    appLocale,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page);
    await seedClient(page, workspaceId, { name: 'Anna de Vries', email: annaEmail });
    await page.reload();

    const panel = await openPanel(page, copy);
    const label = trainerWordForms('trainer', appLocale).Word;
    const trainer = panel.getByRole('combobox', { name: label });
    // John trains, so the field starts on him: "John (ik)".
    await expect(trainer.locator('option')).toHaveText([
      copy.sessions.form.trainerMe.replace('{name}', 'John'),
      'Sarah',
      'Tom',
    ]);
    await expect(trainer.locator('option:checked')).toHaveText(
      copy.sessions.form.trainerMe.replace('{name}', 'John'),
    );
    await pickClient(panel, '', 'Anna de Vries');
    await trainer.selectOption({ label: 'Tom' });
    await panel.getByLabel(copy.sessions.form.dateLabel).fill(thursday());
    await panel.getByLabel(copy.sessions.form.startLabel).fill('11:30');
    await panel.getByRole('button', { name: copy.sessions.form.save }).click();
    await page.getByRole('link', { name: copy.sessions.form.open }).click();

    await expect(page.getByRole('main').getByText('Tom', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    const session = await storedSession(page, workspaceId, page.url().split('/').pop() ?? '');
    expect(session.trainer?.name).toBe('Tom');
  });

  test('AC3: an English client’s note says in English, and only a checked box sends the email', async ({
    page,
    context,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page);
    await seedClient(page, workspaceId, { name: 'Anna de Vries', email: annaEmail });
    await seedClient(page, workspaceId, {
      name: 'Mark Jansen',
      email: markEmail,
      emailLocale: 'en',
    });
    await page.reload();

    // Anna with the box unchecked: nothing is sent.
    let panel = await openPanel(page, copy);
    await pickClient(panel, '', 'Anna de Vries');
    await panel.getByLabel(copy.sessions.form.dateLabel).fill(thursday());
    await panel.getByLabel(copy.sessions.form.startLabel).fill('09:00');
    await panel
      .getByRole('checkbox', {
        name: copy.sessions.form.notify.replace('{client}', 'Anna de Vries'),
      })
      .uncheck();
    await panel.getByRole('button', { name: copy.sessions.form.save }).click();
    await expect(page.getByRole('status')).toBeVisible();

    // Mark, in English, with the box checked.
    panel = await openPanel(page, copy);
    await pickClient(panel, 'mark', 'Mark Jansen');
    await expect(
      panel.getByText(
        copy.sessions.form.notifyNote
          .replace('{email}', markEmail)
          .replace('{language}', copy.sessions.form.languageEn),
      ),
    ).toBeVisible();
    await panel.getByLabel(copy.sessions.form.dateLabel).fill(thursday(1));
    await panel.getByLabel(copy.sessions.form.startLabel).fill('09:00');
    await panel.getByRole('button', { name: copy.sessions.form.save }).click();
    await expect(page.getByRole('status')).toContainText('Mark Jansen');

    const mail = await waitForEmail(markEmail);
    expect(mail.subject.startsWith(subjectStart('en', 'privateSession'))).toBe(true);
    expect(await emailsTo(annaEmail)).toHaveLength(0);
  });

  test('AC4: the DST message, the repeated-hour note and (volgende dag) show in the form', async ({
    page,
    context,
    messages: copy,
    appLocale,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page);
    await seedClient(page, workspaceId, { name: 'Anna de Vries', email: annaEmail });
    await page.reload();
    const panel = await openPanel(page, copy);
    await pickClient(panel, '', 'Anna de Vries');
    const date = panel.getByLabel(copy.sessions.form.dateLabel);
    const start = panel.getByLabel(copy.sessions.form.startLabel);
    const march = new Intl.DateTimeFormat(appLocale === 'en' ? 'en-GB' : 'nl-NL', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // 02:30 on 28 March 2027 does not exist in Amsterdam: refused, and nothing is saved.
    await date.fill('2027-03-28');
    await start.fill('02:30');
    await expect(
      panel.getByText(
        copy.sessions.form.errors.timeDoesNotExist.replace(
          '{date}',
          march.format(new Date('2027-03-28T12:00:00Z')),
        ),
      ),
    ).toBeVisible();
    await expect(start).toHaveAttribute('aria-invalid', 'true');
    await expectNoAxeViolations(page, `PS-01 with the DST message in ${appLocale}`);
    await panel.getByRole('button', { name: copy.sessions.form.save }).click();
    await expect(page.getByRole('status')).toHaveCount(0);

    // 02:30 on 25 October 2026 happens twice: the first one is used, and the form says so.
    await date.fill('2026-10-25');
    await start.fill('02:30');
    await expect(
      panel.getByText(
        copy.sessions.form.notes.repeatedTime
          .replace('{date}', march.format(new Date('2026-10-25T12:00:00Z')))
          .replace('{time}', '02:30'),
      ),
    ).toBeVisible();

    // 23:30 for 90 minutes ends at 01:00 the next day.
    await date.fill(thursday());
    await start.fill('23:30');
    await panel.getByRole('radio', { name: '90 min' }).check({ force: true });
    await expect(
      panel.getByText(copy.sessions.form.endsAtNextDay.replace('{time}', '01:00')),
    ).toBeVisible();
    await expectNoAxeViolations(page, `PS-01 with a repeated-hour note in ${appLocale}`);
  });

  test('AC5: a session in the past warns, saves, and sends no email', async ({
    page,
    context,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page);
    await seedClient(page, workspaceId, { name: 'Anna de Vries', email: annaEmail });
    await page.reload();
    const panel = await openPanel(page, copy);
    await pickClient(panel, '', 'Anna de Vries');
    await panel
      .getByLabel(copy.sessions.form.dateLabel)
      .fill(plusDays(new Date().toISOString().slice(0, 10), -2));
    await panel.getByLabel(copy.sessions.form.startLabel).fill('09:00');
    await expect(panel.getByText(copy.sessions.form.notes.past)).toBeVisible();
    // The box is still checked: the API never emails a past session.
    await panel.getByRole('button', { name: copy.sessions.form.save }).click();
    await expect(page.getByRole('status')).toContainText('Anna de Vries');
    await page.getByRole('link', { name: copy.sessions.form.open }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${slug}/sessions/`));
    expect(await emailsTo(annaEmail)).toHaveLength(0);
  });

  test('closing a form with input asks to discard it; quick add picks the new client', async ({
    page,
    context,
    messages: copy,
  }) => {
    const { sarah, slug } = await team();
    await signInWithSession(context, sarah);
    await page.goto(`/w/${slug}`);
    const panel = await openPanel(page, copy);

    // PS-02 quick add: a name from the search, an email address, and the new client is chosen.
    await panel.getByRole('searchbox').fill('Eva Smit');
    await panel
      .getByRole('button', {
        name: copy.sessions.form.clientNewNamed.replace('{query}', 'Eva Smit'),
      })
      .click();
    await panel.getByLabel(copy.clients.addDialog.emailLabel).fill('eva@example.com');
    await panel.getByRole('button', { name: copy.sessions.form.newClientAdd }).click();
    await expect(panel.getByText('eva@example.com', { exact: true }).first()).toBeVisible();
    await expect(
      panel.getByRole('button', { name: copy.sessions.form.clientChange }),
    ).toBeVisible();

    // Nothing entered is lost by accident: Escape asks first.
    await page.keyboard.press('Escape');
    const ask = page.getByRole('alertdialog', { name: copy.sessions.form.discardTitle });
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: copy.sessions.form.keepEditing }).click();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: copy.sessions.form.cancel }).click();
    await page
      .getByRole('alertdialog', { name: copy.sessions.form.discardTitle })
      .getByRole('button', { name: copy.sessions.form.discard })
      .click();
    await expect(panel).toHaveCount(0);

    // An untouched form closes without asking.
    const again = await openPanel(page, copy);
    await again.getByRole('button', { name: copy.sessions.form.cancel }).click();
    await expect(again).toHaveCount(0);
  });

  test('AC6: Sarah reschedules with and without notifying Anna, and the button says which', async ({
    page,
    context,
    messages: copy,
    appLocale,
  }) => {
    const { sarah, slug } = await team();
    await signInWithSession(context, sarah);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page);
    const anna = await seedClient(page, workspaceId, {
      name: 'Anna de Vries',
      email: annaEmail,
    });
    const first = await seedSession(page, workspaceId, {
      clientId: anna.id,
      localDate: thursday(),
      localStart: '09:00',
    });

    await page.goto(`/w/${slug}/sessions/${first.id}`);
    await page.getByRole('button', { name: copy.sessions.page.reschedule }).click();
    const dialog = page.getByRole('dialog', { name: copy.sessions.reschedule.title });
    await expect(dialog).toBeVisible();
    // Where the session is now, and where it stays.
    await expect(
      dialog.getByText(new RegExp(`^${copy.sessions.reschedule.current.split('{date}')[0]}`)),
    ).toContainText('09:00–10:00');
    await expect(
      dialog.getByText(copy.sessions.reschedule.locationUnchanged.replace('{location}', GYM)),
    ).toBeVisible();
    await expect(
      dialog.getByText(
        copy.sessions.reschedule.notifyNote
          .replace('{client}', 'Anna de Vries')
          .replace('{language}', copy.sessions.form.languageNl),
      ),
    ).toBeVisible();
    const notify = dialog.getByRole('checkbox', {
      name: copy.sessions.reschedule.notify.replace('{client}', 'Anna de Vries'),
    });
    await expect(notify).toBeChecked();
    await expect(
      dialog.getByRole('button', { name: copy.sessions.reschedule.submitNotify }),
    ).toBeVisible();
    await expectNoAxeViolations(page, `PS-05 in ${appLocale}`);

    // Friday 10:00 with the email.
    const friday = plusDays(thursday(), 1);
    await dialog.getByLabel(copy.sessions.reschedule.dateLabel).fill(friday);
    await dialog.getByLabel(copy.sessions.form.startLabel).fill('10:00');
    await dialog.getByRole('button', { name: copy.sessions.reschedule.submitNotify }).click();
    await expect(dialog).toHaveCount(0);
    const moved = copy.sessions.page.moved
      .replace('{date}', dayOf(`${friday}T08:00:00Z`, appLocale))
      .replace('{time}', '10:00');
    await expect(page.getByRole('status')).toHaveText(moved);
    const mail = await waitForEmail(annaEmail);
    expect(mail.subject.startsWith(subjectStart('nl-NL', 'privateSessionMoved'))).toBe(true);
    const stored = await storedSession(page, workspaceId, first.id);
    expect(stored.location.name).toBe(GYM);
    // 10:00 on the wall clock of Amsterdam, whatever the offset of that day is.
    expect(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Amsterdam',
        dateStyle: 'short',
        timeStyle: 'short',
        hourCycle: 'h23',
      }).format(new Date(stored.startsAt)),
    ).toBe(`${friday}, 10:00`);
    expect(stored.version).toBe(2);

    // Without the email: the button says Verplaatsen and nothing more is sent.
    await page.getByRole('button', { name: copy.sessions.page.reschedule }).click();
    const again = page.getByRole('dialog', { name: copy.sessions.reschedule.title });
    await again
      .getByRole('checkbox', {
        name: copy.sessions.reschedule.notify.replace('{client}', 'Anna de Vries'),
      })
      .uncheck();
    await expect(
      again.getByRole('button', { name: copy.sessions.reschedule.submit, exact: true }),
    ).toBeVisible();
    await again.getByLabel(copy.sessions.reschedule.dateLabel).fill(plusDays(friday, 3));
    await again.getByRole('button', { name: copy.sessions.reschedule.submit, exact: true }).click();
    await expect(again).toHaveCount(0);
    await expect(page.getByRole('status')).not.toHaveText(moved);
    expect(await emailsTo(annaEmail)).toHaveLength(1);
    expect((await storedSession(page, workspaceId, first.id)).version).toBe(3);
  });

  test('AC8: a session changed meanwhile shows who did it and the reloaded values', async ({
    page,
    context,
    browser,
    messages: copy,
  }) => {
    const { john, sarah, slug } = await team();
    await signInWithSession(context, sarah);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page);
    const anna = await seedClient(page, workspaceId, {
      name: 'Anna de Vries',
      email: annaEmail,
    });
    const session = await seedSession(page, workspaceId, {
      clientId: anna.id,
      localDate: thursday(),
      localStart: '09:00',
    });
    await page.goto(`/w/${slug}/sessions/${session.id}`);
    await page.getByRole('button', { name: copy.sessions.page.reschedule }).click();
    const dialog = page.getByRole('dialog', { name: copy.sessions.reschedule.title });
    await expect(dialog).toBeVisible();

    // John moves the same session to Saturday while Sarah's form is open.
    const other = await browser.newContext({ extraHTTPHeaders: clientIpHeaders() });
    await signInWithSession(other, john);
    const saturday = plusDays(thursday(), 2);
    const moved = await other.request.post(
      `/api/v1/workspaces/${workspaceId}/sessions/${session.id}/reschedule`,
      {
        data: {
          localDate: saturday,
          localStart: '08:00',
          durationMinutes: 45,
          notify: false,
          version: 1,
        },
      },
    );
    expect(moved.status()).toBe(200);
    await other.close();

    await dialog.getByLabel(copy.sessions.reschedule.dateLabel).fill(plusDays(thursday(), 1));
    await dialog.getByRole('button', { name: copy.sessions.reschedule.submitNotify }).click();

    await expect(
      dialog.getByText(copy.sessions.reschedule.changedBy.replace('{name}', 'John')),
    ).toBeVisible();
    // The form now holds John's values, and Sarah decides again with the new version.
    await expect(dialog.getByLabel(copy.sessions.reschedule.dateLabel)).toHaveValue(saturday);
    await expect(dialog.getByLabel(copy.sessions.form.startLabel)).toHaveValue('08:00');
    await expect(dialog.getByRole('radio', { name: '45 min' })).toBeChecked();
    await dialog.getByRole('button', { name: copy.sessions.reschedule.submitNotify }).click();
    await expect(dialog).toHaveCount(0);
    expect((await storedSession(page, workspaceId, session.id)).version).toBe(3);
  });

  test('AC7: Tom can open Sarah’s session, and moving it is refused', async ({
    page,
    context,
    browser,
    messages: copy,
  }) => {
    const { sarah, tom, slug } = await team();
    await signInWithSession(context, sarah);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page);
    const anna = await seedClient(page, workspaceId, {
      name: 'Anna de Vries',
      email: annaEmail,
    });
    const session = await seedSession(page, workspaceId, {
      clientId: anna.id,
      localDate: thursday(),
      localStart: '09:00',
    });
    const toms = await browser.newContext({ extraHTTPHeaders: clientIpHeaders() });
    await signInWithSession(toms, tom);
    const tab = await toms.newPage();
    await tab.goto(`/w/${slug}/sessions/${session.id}`);
    await tab.getByRole('button', { name: copy.sessions.page.reschedule }).click();
    const dialog = tab.getByRole('dialog', { name: copy.sessions.reschedule.title });
    await dialog.getByLabel(copy.sessions.reschedule.dateLabel).fill(plusDays(thursday(), 1));
    await dialog.getByRole('button', { name: copy.sessions.reschedule.submitNotify }).click();

    await expect(dialog.getByText(copy.sessions.reschedule.noPermission)).toBeVisible();
    expect((await storedSession(page, workspaceId, session.id)).version).toBe(1);
    await toms.close();
  });

  test('AC9: the client profile lists the upcoming sessions in order, and says when there are none', async ({
    page,
    context,
    messages: copy,
    appLocale,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page);
    const anna = await seedClient(page, workspaceId, {
      name: 'Anna de Vries',
      email: annaEmail,
    });
    const mark = await seedClient(page, workspaceId, {
      name: 'Mark Jansen',
      email: markEmail,
    });
    // Three upcoming and one past, planned out of order.
    for (const [weeks, start] of [
      [2, '08:00'],
      [0, '09:00'],
      [1, '10:30'],
    ] as const) {
      await seedSession(page, workspaceId, {
        clientId: anna.id,
        localDate: thursday(weeks),
        localStart: start,
      });
    }
    await seedSession(page, workspaceId, {
      clientId: anna.id,
      localDate: plusDays(new Date().toISOString().slice(0, 10), -3),
      localStart: '09:00',
    });

    await page.goto(`/w/${slug}/clients/${anna.id}`);
    const section = page.getByRole('region', { name: copy.clients.profile.upcomingTitle });
    const rows = section.getByRole('listitem');
    await expect(rows).toHaveCount(3);
    const times = ['09:00', '10:30', '08:00'];
    for (const [index, time] of times.entries()) {
      await expect(rows.nth(index)).toContainText(
        copy.clients.profile.upcomingWhen
          .replace(
            '{date}',
            dayOf(`${thursday(index === 0 ? 0 : index === 1 ? 1 : 2)}T12:00:00Z`, appLocale),
          )
          .replace('{time}', time),
      );
      await expect(rows.nth(index)).toContainText('John');
    }
    await expectNoAxeViolations(page, `TW-02 with upcoming sessions in ${appLocale}`);
    await rows.nth(0).getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/w/${slug}/sessions/[0-9a-f-]{36}$`));

    await page.goto(`/w/${slug}/clients/${mark.id}`);
    await expect(
      page
        .getByRole('region', { name: copy.clients.profile.upcomingTitle })
        .getByText(copy.clients.profile.upcomingEmpty),
    ).toBeVisible();
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 375, height: 800 } });

    test('PS-01, the session page and PS-05 work and pass axe at 375 px', async ({
      page,
      context,
      messages: copy,
      appLocale,
    }) => {
      const { sarah, slug } = await team();
      await signInWithSession(context, sarah);
      await page.goto(`/w/${slug}`);
      const workspaceId = await gymId(page);
      await seedClient(page, workspaceId, { name: 'Anna de Vries', email: annaEmail });
      await page.reload();

      const panel = await openPanel(page, copy);
      await pickClient(panel, 'ann', 'Anna de Vries');
      await panel.getByLabel(copy.sessions.form.dateLabel).fill(thursday());
      await panel.getByLabel(copy.sessions.form.startLabel).fill('09:00');
      const box = await panel.boundingBox();
      expect(box?.width).toBeLessThanOrEqual(375);
      await expectNoAxeViolations(page, `PS-01 on a phone in ${appLocale}`);
      await panel.getByRole('button', { name: copy.sessions.form.save }).click();
      await page.getByRole('link', { name: copy.sessions.form.open }).click();
      await expect(page).toHaveURL(new RegExp(`/w/${slug}/sessions/`));
      await expectNoAxeViolations(page, `the session page on a phone in ${appLocale}`);

      await page.getByRole('button', { name: copy.sessions.page.reschedule }).click();
      await expect(
        page.getByRole('dialog', { name: copy.sessions.reschedule.title }),
      ).toBeVisible();
      await expectNoAxeViolations(page, `PS-05 on a phone in ${appLocale}`);
    });
  });
});

/** The fixed start of an email subject in the client's language, before its first placeholder. */
function subjectStart(locale: Locale, email: 'privateSession' | 'privateSessionMoved') {
  return catalogs[locale].email[email].subject.split('{')[0] ?? '';
}
