import { trainerWordForms } from '@fivvi/i18n';
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

// F021 (spec #427, ticket #449): *Lessen* (TW-03), a class on a date from the class's page or from
// + Nieuw → Groepsles, CO-01 and its *Wijzigen* (CO-04). Copy comes from the catalogs. Each spec
// has accounts and workspaces of its own (see language.spec.ts): John owns John's Gym (and trains),
// Sarah and Tom are Trainers there. Dates are relative to the day the spec runs.
const GYM = "John's Gym";

interface ClassBody {
  id: string;
  nameNl: string;
  nameEn: string | null;
  capacity: number;
  durationMinutes: number;
  defaultTrainer?: { id: string; name: string };
}

interface SessionBody {
  id: string;
  version: number;
  startsAt: string;
  endsAt: string;
  capacity: number;
  trainer?: { id: string; name: string };
  location: { name: string };
  groupClass?: { id: string };
}

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

test.describe('F021 classes on the web', () => {
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

  /** Makes a class through the API, as the data a spec starts from. */
  async function seedClass(
    request: APIRequestContext,
    workspaceId: string,
    data: Record<string, unknown>,
  ): Promise<ClassBody> {
    const response = await request.post(`/api/v1/workspaces/${workspaceId}/group-classes`, {
      data: { nameNl: 'Kracht', capacity: 8, durationMinutes: 60, ...data },
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

  async function fillClassForm(
    dialog: ReturnType<Page['getByRole']>,
    copy: typeof import('@fivvi/i18n')['messages']['en'],
    appLocale: 'nl-NL' | 'en',
    values: {
      nameNl?: string;
      nameEn?: string;
      descriptionNl?: string;
      trainer?: string;
      capacity?: string;
      duration?: string;
    },
  ) {
    const form = copy.classes.form;
    if (values.nameNl !== undefined) {
      await dialog.getByLabel(form.nameNlLabel, { exact: true }).fill(values.nameNl);
    }
    if (values.nameEn !== undefined) {
      await dialog.getByLabel(form.nameEnLabel, { exact: true }).fill(values.nameEn);
    }
    if (values.descriptionNl !== undefined) {
      await dialog.getByLabel(form.descriptionNlLabel, { exact: true }).fill(values.descriptionNl);
    }
    if (values.trainer !== undefined) {
      await dialog
        .getByRole('combobox', { name: trainerWordForms('trainer', appLocale).Word })
        .selectOption({ label: values.trainer });
    }
    if (values.capacity !== undefined) {
      await dialog.getByLabel(form.capacityLabel, { exact: true }).fill(values.capacity);
    }
    if (values.duration !== undefined) {
      await dialog.getByLabel(form.durationLabel, { exact: true }).fill(values.duration);
    }
  }

  test('AC1: class list shows the viewer’s language, else Dutch', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}/classes`);
    const workspaceId = await gymId(page.request);
    const name = (nl: string, en: string) => (appLocale === 'en' ? en : nl);

    // The empty list says so, and Lessen is the current page of the navigation.
    await expect(page.getByRole('heading', { level: 1, name: copy.classes.title })).toBeVisible();
    await expect(page.getByText(copy.classes.empty)).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: copy.workspaceNav.label })
        .getByRole('link', { name: copy.workspaceNav.classes }),
    ).toHaveAttribute('aria-current', 'page');
    await expectNoAxeViolations(page, `TW-03 empty in ${appLocale}`);

    await page.getByRole('button', { name: copy.classes.new, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: copy.classes.form.title });
    await expect(dialog).toBeVisible();

    // Design: the two sections and the four labels naming their language.
    await expect(
      dialog.getByRole('heading', { name: copy.classes.form.nameSection }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: copy.classes.form.classSection }),
    ).toBeVisible();
    for (const label of [
      copy.classes.form.nameNlLabel,
      copy.classes.form.nameEnLabel,
      copy.classes.form.descriptionNlLabel,
      copy.classes.form.descriptionEnLabel,
    ]) {
      await expect(dialog.getByLabel(label, { exact: true })).toBeVisible();
    }
    await expectNoAxeViolations(page, `the class form in ${appLocale}`);

    await fillClassForm(dialog, copy, appLocale, {
      nameNl: 'Kracht',
      nameEn: 'Strength',
      descriptionNl: 'Een stevige les voor het hele lichaam.',
      trainer: 'Sarah',
      capacity: '8',
      duration: '60',
    });
    await dialog.getByRole('button', { name: copy.classes.form.save }).click();

    await expect(
      page.getByRole('status').filter({ hasText: copy.classes.form.saved }),
    ).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: name('Kracht', 'Strength') });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Sarah');
    await expect(row).toContainText(appLocale === 'en' ? '8 spots' : '8 plekken');
    await expect(row).toContainText(copy.classes.minutes.replace('{minutes}', '60'));
    await expect(page.getByText(name('Strength', 'Kracht'), { exact: true })).toHaveCount(0);
    await expectNoAxeViolations(page, `TW-03 with a class in ${appLocale}`);

    // The data path: the API holds the class for John's Gym, with both names and the Dutch description only.
    const stored = (await (
      await page.request.get(`/api/v1/workspaces/${workspaceId}/group-classes`)
    ).json()) as (ClassBody & { descriptionNl: string | null; descriptionEn: string | null })[];
    expect(stored).toMatchObject([
      {
        nameNl: 'Kracht',
        nameEn: 'Strength',
        descriptionNl: 'Een stevige les voor het hele lichaam.',
        descriptionEn: null,
        capacity: 8,
        durationMinutes: 60,
        defaultTrainer: { name: 'Sarah' },
      },
    ]);

    // The class page: the name in the viewer's language, the description in Dutch whatever the language.
    await row.getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/w/${slug}/classes/[0-9a-f-]{36}$`));
    await expect(
      page.getByRole('heading', { level: 1, name: name('Kracht', 'Strength') }),
    ).toBeVisible();
    await expect(page.getByText('Een stevige les voor het hele lichaam.')).toBeVisible();
    await expectNoAxeViolations(page, `the class page in ${appLocale}`);
  });

  test('AC2: form messages', async ({ page, context, appLocale, messages: copy }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}/classes`);
    await page.getByRole('button', { name: copy.classes.new, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: copy.classes.form.title });
    const errors = copy.classes.form.errors;
    const capacity = errors.capacityInvalid.replace('{min}', '1').replace('{max}', '100');
    const duration = errors.durationInvalid
      .replace('{min}', '15')
      .replace('{max}', '240')
      .replace('{step}', '5');

    // An empty Dutch name, a capacity of 0 and a duration of 7 minutes: one message per field.
    await fillClassForm(dialog, copy, appLocale, { nameNl: '', capacity: '0', duration: '7' });
    await dialog.getByRole('button', { name: copy.classes.form.save }).click();
    await expect(dialog.getByText(errors.nameRequired)).toBeVisible();
    await expect(dialog.getByText(capacity)).toBeVisible();
    await expect(dialog.getByText(duration)).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveCount(3);
    await expect(dialog.getByLabel(copy.classes.form.nameNlLabel, { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expectNoAxeViolations(page, `the class form with messages in ${appLocale}`);

    // 101 spots is refused the same way.
    await fillClassForm(dialog, copy, appLocale, {
      nameNl: 'Kracht',
      capacity: '101',
      duration: '60',
    });
    await dialog.getByRole('button', { name: copy.classes.form.save }).click();
    await expect(dialog.getByText(capacity)).toBeVisible();
    await expect(dialog.getByText(errors.nameRequired)).toHaveCount(0);
    await expect(dialog.getByText(duration)).toHaveCount(0);

    // Nothing was stored.
    const workspaceId = await gymId(page.request);
    expect(
      await (await page.request.get(`/api/v1/workspaces/${workspaceId}/group-classes`)).json(),
    ).toEqual([]);
  });

  test('AC3: schedule on a date and open CO-01', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const sarah = await trainerId(page.request, workspaceId, 'Sarah');
    const kracht = await seedClass(page.request, workspaceId, {
      nameEn: 'Strength',
      trainerId: sarah,
    });
    const name = appLocale === 'en' ? 'Strength' : 'Kracht';

    await page.goto(`/w/${slug}/classes/${kracht.id}`);
    await page.getByRole('button', { name: copy.classes.page.schedule }).click();
    const dialog = page.getByRole('dialog', { name: copy.classes.schedule.title });
    await expect(dialog).toBeVisible();
    // Design: the date and the start are under Wanneer; trainer and capacity are prefilled.
    await expect(
      dialog.getByRole('heading', { name: copy.classes.schedule.whenSection }),
    ).toBeVisible();
    await expect(
      dialog.getByLabel(copy.classes.schedule.capacityLabel, { exact: true }),
    ).toHaveValue('8');
    await expect(
      dialog.getByRole('combobox', { name: trainerWordForms('trainer', appLocale).Word }),
    ).toHaveValue(sarah);
    await expect(
      dialog.getByText(copy.classes.schedule.location.replace('{name}', GYM)),
    ).toBeVisible();
    await dialog.getByLabel(copy.classes.schedule.dateLabel, { exact: true }).fill(tuesday());
    await dialog.getByLabel(copy.classes.schedule.startLabel, { exact: true }).fill('18:00');
    await expect(
      dialog.getByText(copy.classes.schedule.endsAt.replace('{time}', '19:00')),
    ).toBeVisible();
    await expectNoAxeViolations(page, `the schedule form in ${appLocale}`);
    await dialog.getByRole('button', { name: copy.classes.schedule.save }).click();

    // CO-01 opens with what was saved.
    await expect(page).toHaveURL(new RegExp(`/w/${slug}/classes/${kracht.id}/[0-9a-f-]{36}$`), {
      timeout: 15_000,
    });
    await expect(
      page.getByRole('status').filter({ hasText: copy.classes.schedule.saved }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    const main = page.getByRole('main');
    await expect(main.getByText('18:00–19:00')).toBeVisible();
    await expect(main.getByText(GYM, { exact: true })).toBeVisible();
    await expect(main.getByText('Sarah', { exact: true })).toBeVisible();
    await expect(
      main.getByText(
        appLocale === 'en' ? '0/8 booked · 8 spots free' : '0/8 geboekt · 8 plekken vrij',
      ),
    ).toBeVisible();
    await expect(main.getByText(copy.classes.date.noBookings)).toBeVisible();
    await expectNoAxeViolations(page, `CO-01 in ${appLocale}`);

    // The data path: a group session of the class with Sarah, 8 spots and the default location, 18:00–19:00 in Amsterdam.
    const id = page.url().split('/').pop() ?? '';
    const session = (await (
      await page.request.get(`/api/v1/workspaces/${workspaceId}/sessions/${id}`)
    ).json()) as SessionBody;
    expect(session).toMatchObject({
      type: 'group',
      capacity: 8,
      trainer: { name: 'Sarah' },
      location: { name: GYM },
      groupClass: { id: kracht.id },
    });
    expect(clockOf(session.startsAt)).toBe('18:00');
    expect(clockOf(session.endsAt)).toBe('19:00');
  });

  test('AC3: + Nieuw → Groepsles asks for the class first, or Nieuwe les', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    await seedClass(page.request, workspaceId, { nameNl: 'Mobility', capacity: 12 });
    await page.reload();

    await page.getByRole('button', { name: copy.workspaceNav.new, exact: true }).click();
    await page.getByRole('button', { name: copy.workspaceNav.newGroupClass, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: copy.classes.schedule.title });
    await expect(dialog).toBeVisible();

    // Without a class the save asks for one.
    await dialog.getByLabel(copy.classes.schedule.dateLabel, { exact: true }).fill(tuesday());
    await dialog.getByLabel(copy.classes.schedule.startLabel, { exact: true }).fill('07:30');
    await dialog.getByRole('button', { name: copy.classes.schedule.save }).click();
    await expect(dialog.getByText(copy.classes.schedule.errors.classRequired)).toBeVisible();

    // Nieuwe les: the class form, then the same scheduling for the class just made.
    await dialog.getByRole('button', { name: copy.classes.new, exact: true }).click();
    const form = page.getByRole('dialog', { name: copy.classes.form.title });
    await fillClassForm(form, copy, appLocale, {
      nameNl: 'Kracht',
      capacity: '10',
      duration: '45',
    });
    await form.getByRole('button', { name: copy.classes.form.save }).click();
    const again = page.getByRole('dialog', { name: copy.classes.schedule.title });
    await expect(again.getByText('Kracht', { exact: true })).toBeVisible();
    await expect(
      again.getByLabel(copy.classes.schedule.capacityLabel, { exact: true }),
    ).toHaveValue('10');
    await again.getByLabel(copy.classes.schedule.dateLabel, { exact: true }).fill(tuesday());
    await again.getByLabel(copy.classes.schedule.startLabel, { exact: true }).fill('07:30');
    await expect(
      again.getByText(copy.classes.schedule.endsAt.replace('{time}', '08:15')),
    ).toBeVisible();
    await again.getByRole('button', { name: copy.classes.schedule.save }).click();

    await expect(page).toHaveURL(new RegExp(`/w/${slug}/classes/[0-9a-f-]{36}/[0-9a-f-]{36}$`), {
      timeout: 15_000,
    });
    await expect(page.getByRole('heading', { level: 1, name: 'Kracht' })).toBeVisible();
    await expect(page.getByRole('main').getByText('07:30–08:15')).toBeVisible();
    // Trainer nodig (AC5): the class was made without a trainer.
    await expect(
      page
        .getByRole('main')
        .getByText(
          copy.classes.trainerNeeded.replace('{Word}', trainerWordForms('trainer', appLocale).Word),
        ),
    ).toBeVisible();
  });

  test('AC4: CO-04 edit and its validation', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const sarah = await trainerId(page.request, workspaceId, 'Sarah');
    const kracht = await seedClass(page.request, workspaceId, { trainerId: sarah });
    const date = await seedDate(page.request, workspaceId, kracht.id);
    const other = await seedDate(page.request, workspaceId, kracht.id, { localStart: '10:00' });

    await page.goto(`/w/${slug}/classes/${kracht.id}/${date.id}`);
    await page.getByRole('button', { name: copy.classes.date.edit }).click();
    const dialog = page.getByRole('dialog', { name: copy.classes.edit.title });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(copy.classes.edit.startLabel, { exact: true })).toHaveValue(
      '18:00',
    );
    await expect(dialog.getByLabel(copy.classes.edit.endLabel, { exact: true })).toHaveValue(
      '19:00',
    );
    await expectNoAxeViolations(page, `CO-04 in ${appLocale}`);

    // An end before the start shows the CO-04 message and stores nothing.
    await dialog.getByLabel(copy.classes.edit.endLabel, { exact: true }).fill('17:00');
    await dialog.getByRole('button', { name: copy.classes.edit.save }).click();
    await expect(dialog.getByText(copy.classes.edit.errors.endBeforeStart)).toBeVisible();
    await expectNoAxeViolations(page, `CO-04 with its message in ${appLocale}`);
    expect(
      (
        (await (
          await page.request.get(`/api/v1/workspaces/${workspaceId}/sessions/${date.id}`)
        ).json()) as SessionBody
      ).version,
    ).toBe(1);

    // The start moves to 18:30 and the capacity to 10.
    await dialog.getByLabel(copy.classes.edit.endLabel, { exact: true }).fill('19:00');
    await dialog.getByLabel(copy.classes.edit.startLabel, { exact: true }).fill('18:30');
    await dialog.getByLabel(copy.classes.edit.capacityLabel, { exact: true }).fill('10');
    await dialog.getByRole('button', { name: copy.classes.edit.save }).click();
    await expect(
      page.getByRole('status').filter({ hasText: copy.classes.edit.saved }),
    ).toBeVisible();
    const main = page.getByRole('main');
    await expect(main.getByText('18:30–19:00')).toBeVisible();
    await expect(
      main.getByText(
        appLocale === 'en' ? '0/10 booked · 10 spots free' : '0/10 geboekt · 10 plekken vrij',
      ),
    ).toBeVisible();

    // The data path: only this date changed; the class keeps its capacity of 8, the other date is untouched.
    const stored = (await (
      await page.request.get(`/api/v1/workspaces/${workspaceId}/sessions/${date.id}`)
    ).json()) as SessionBody;
    expect(stored.capacity).toBe(10);
    expect(clockOf(stored.startsAt)).toBe('18:30');
    const untouched = (await (
      await page.request.get(`/api/v1/workspaces/${workspaceId}/sessions/${other.id}`)
    ).json()) as SessionBody;
    expect(untouched).toMatchObject({ capacity: 8, version: 1 });
    expect(
      (await (
        await page.request.get(`/api/v1/workspaces/${workspaceId}/group-classes/${kracht.id}`)
      ).json()) as ClassBody,
    ).toMatchObject({ capacity: 8 });
  });

  test('AC5: Trainer nodig on CO-01', async ({ page, context, appLocale, messages: copy }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const kracht = await seedClass(page.request, workspaceId, {});
    const date = await seedDate(page.request, workspaceId, kracht.id);
    const needed = copy.classes.trainerNeeded.replace(
      '{Word}',
      trainerWordForms('trainer', appLocale).Word,
    );

    expect(date.trainer).toBeUndefined();
    await page.goto(`/w/${slug}/classes/${kracht.id}/${date.id}`);
    await expect(page.getByRole('main').getByText(needed)).toBeVisible();
    await page.goto(`/w/${slug}/classes`);
    await expect(page.getByRole('row').filter({ hasText: 'Kracht' })).toContainText(needed);
    await expectNoAxeViolations(page, `TW-03 with Trainer nodig in ${appLocale}`);
  });

  test('AC7: Trainer has no Classes page and sees CO-01 with no action but Boekingslink kopiëren', async ({
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
    const kracht = await seedClass(owner.request, workspaceId, {});
    const date = await seedDate(owner.request, workspaceId, kracht.id);
    await owner.close();

    await signInWithSession(context, sarah);
    await page.goto(`/w/${slug}`);
    await expect(
      page.getByRole('navigation', { name: copy.workspaceNav.label }).getByRole('link', {
        name: copy.workspaceNav.classes,
      }),
    ).toHaveCount(0);
    // + Nieuw has Privésessie and no Groepsles.
    await page.getByRole('button', { name: copy.workspaceNav.new, exact: true }).click();
    await expect(
      page.getByRole('button', { name: copy.workspaceNav.newPrivateSession, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: copy.workspaceNav.newGroupClass, exact: true }),
    ).toHaveCount(0);

    // Lessen shows the no-permission page, in the workspace's name.
    await page.goto(`/w/${slug}/classes`);
    await expect(
      page.getByRole('heading', { level: 1, name: copy.noPermission.title }),
    ).toBeVisible();
    await expect(page.getByText(copy.noPermission.body.replace('{workspace}', GYM))).toBeVisible();
    await expectNoAxeViolations(page, `Lessen without permission in ${appLocale}`);

    // The routes answer 403 for her.
    const base = `/api/v1/workspaces/${workspaceId}`;
    expect(
      (
        await page.request.post(`${base}/group-classes`, {
          data: { nameNl: 'Yoga', capacity: 8, durationMinutes: 60 },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post(`${base}/group-classes/${kracht.id}/dates`, {
          data: { localDate: tuesday(), localStart: '09:00' },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.patch(`${base}/sessions/${date.id}`, {
          data: { version: 1, capacity: 9 },
        })
      ).status(),
    ).toBe(403);

    // She reads CO-01 of any class date, with no action but Boekingslink kopiëren (F037, #968).
    await page.goto(`/w/${slug}/classes/${kracht.id}/${date.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Kracht' })).toBeVisible();
    await expect(page.getByRole('main').getByText('18:00–19:00')).toBeVisible();
    await expect(page.getByRole('main').getByRole('button')).toHaveCount(1);
    await expect(
      page.getByRole('main').getByRole('button', { name: copy.bookingLinks.copyBooking }),
    ).toBeVisible();
    await expect(page.getByRole('main').getByRole('link')).toHaveCount(0);
    await expectNoAxeViolations(page, `CO-01 as a Trainer in ${appLocale}`);
  });
});
