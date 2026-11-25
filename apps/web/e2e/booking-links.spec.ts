import { formattingLocales, type Locale, type Messages, trainerWordForms } from '@fivvi/i18n';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  cancelSession,
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  joinCodeOf,
  joinTeam,
  newAddress,
  passSession,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';

// F037 (spec #473, tickets #966, #968 and #970): TW-07 *Boekingslinks* (the join-link card and the booking
// links, *Nieuwe boekingslink*, *Deactiveren*) and *Boekingslink kopiëren* on CO-01 and in the Agenda's quick view (WC-05). Copy comes from
// the catalogs. Each spec has accounts and workspaces of its own: John is the Owner and Sarah a
// Trainer of John's Gym; the class is Kracht (Strength in English) every Tuesday 18:00. The dates
// are relative to the day the spec runs. *Eén les op een datum* lists the class's upcoming dates from the
// workspace calendar (#1519).
const GYM = "John's Gym";
const PHONE = { width: 390, height: 844 };

interface LinkBody {
  id: string;
  url: string;
  scope: string;
  language: string;
  active: boolean;
}

/** The `YYYY-MM-DD` of the first Tuesday at least three weeks ahead. */
function tuesday(): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 21);
  day.setUTCDate(day.getUTCDate() + ((2 - day.getUTCDay() + 7) % 7));
  return day.toISOString().slice(0, 10);
}

/** "di 17 nov" / "Tue 17 Nov": the Tuesday of `tuesday()` as the list writes it. */
function writtenTuesday(locale: Locale): string {
  return new Intl.DateTimeFormat(formattingLocales[locale], {
    timeZone: 'Europe/Amsterdam',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${tuesday()}T12:00:00Z`));
}

test.describe('F037 booking links on the web', () => {
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

  /** Kracht on the Tuesday, made through the API as the data a spec starts from. */
  async function seedClassDate(request: APIRequestContext, workspaceId: string) {
    const made = await request.post(`/api/v1/workspaces/${workspaceId}/group-classes`, {
      data: { nameNl: 'Kracht', nameEn: 'Strength', capacity: 8, durationMinutes: 60 },
    });
    expect(made.status()).toBe(201);
    const { groupClass } = (await made.json()) as { groupClass: { id: string } };
    const planned = await request.post(
      `/api/v1/workspaces/${workspaceId}/group-classes/${groupClass.id}/dates`,
      { data: { localDate: tuesday(), localStart: '18:00' } },
    );
    expect(planned.status()).toBe(201);
    const session = (await planned.json()) as { id: string };
    return { classId: groupClass.id, sessionId: session.id };
  }

  async function links(request: APIRequestContext, workspaceId: string): Promise<LinkBody[]> {
    const read = await request.get(`/api/v1/workspaces/${workspaceId}/booking-links`);
    expect(read.status()).toBe(200);
    return ((await read.json()) as { links: LinkBody[] }).links;
  }

  const className = (locale: Locale) => (locale === 'en' ? 'Strength' : 'Kracht');
  const boxingLabel = (locale: Locale) => (locale === 'en' ? 'Boxing' : 'Boksen');

  async function openBookingLinks(page: Page, copy: Messages, slug: string) {
    await page.goto(`/w/${slug}`);
    await page
      .getByRole('navigation', { name: copy.workspaceNav.label })
      .getByRole('link', { name: copy.workspaceNav.bookingLinks })
      .click();
    await expect(page).toHaveURL(`/w/${slug}/booking-links`);
  }

  const bookingCard = (page: Page, copy: Messages) =>
    page.getByRole('region', { name: copy.bookingLinks.title });
  const rowOf = (page: Page, copy: Messages, text: string) =>
    bookingCard(page, copy).getByRole('row').filter({ hasText: text });

  test('AC1: TW-07 shows the join link and the standing links', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    const code = await joinCodeOf(slug);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signInWithSession(context, john);

    await openBookingLinks(page, copy, slug);

    await expect(page).toHaveTitle(copy.bookingLinks.title);
    await expect(
      page.getByRole('heading', { level: 1, name: copy.bookingLinks.title }),
    ).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: copy.workspaceNav.label }).getByRole('link', {
        name: copy.workspaceNav.bookingLinks,
      }),
    ).toHaveAttribute('aria-current', 'page');
    // The join-link card stays at the top, as F029 built it.
    const join = page.getByRole('region', { name: copy.joinLink.title });
    await expect(join.getByTestId('join-link-url')).toHaveText(new RegExp(`/j/${code}$`));
    await expect(join.getByRole('button', { name: copy.joinLink.copy })).toBeVisible();
    await expect(page.getByText(copy.bookingLinks.body)).toBeVisible();

    // The two standing links come first, each with the visitor's language, a short URL and a copy button.
    const workspaceId = await gymId(page.request);
    const stored = await links(page.request, workspaceId);
    expect(stored.map(({ scope }) => scope)).toEqual(['all', 'group']);
    const rows = bookingCard(page, copy).getByRole('row');
    await expect(rows).toHaveCount(3);
    for (const [index, label] of [
      copy.bookingLinks.scope.all,
      copy.bookingLinks.scope.group,
    ].entries()) {
      const row = rows.nth(index + 1);
      await expect(row).toContainText(label);
      await expect(row).toContainText(copy.bookingLinks.language.visitor);
      await expect(row.locator('code')).toHaveText(/^https?:\/\/.+\/l\/[a-z0-9]{8}$/);
      await expect(row.locator('code')).toHaveText(stored[index]?.url ?? '');
      await expect(row.getByRole('button', { name: copy.bookingLinks.copy })).toBeVisible();
      await expect(row.getByRole('button', { name: copy.bookingLinks.deactivate })).toBeVisible();
    }
    expect(JSON.stringify(stored)).not.toContain('open_gym');

    // Link kopiëren puts the short URL on the clipboard and says so.
    await rows.nth(1).getByRole('button', { name: copy.bookingLinks.copy }).click();
    await expect(page.getByRole('status')).toHaveText(copy.bookingLinks.copied);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(stored[0]?.url);
    await expectNoAxeViolations(page, `TW-07 of John in ${appLocale}`);

    await page.setViewportSize(PHONE);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoAxeViolations(page, `TW-07 of John on a phone in ${appLocale}`);
  });

  test('AC1: the old Aanmeldlink address goes to TW-07', async ({ page, context }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);

    await page.goto(`/w/${slug}/join-link`);

    await expect(page).toHaveURL(`/w/${slug}/booking-links`);
  });

  test('AC2: new booking link form', async ({ page, context, appLocale, messages: copy }) => {
    const { john, slug } = await team();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signInWithSession(context, john);
    await openBookingLinks(page, copy, slug);
    const workspaceId = await gymId(page.request);
    const { sessionId } = await seedClassDate(page.request, workspaceId);
    await page.reload();
    const form = copy.bookingLinks.new;

    await page.getByRole('button', { name: form.open }).click();
    const dialog = page.getByRole('dialog', { name: form.title });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(form.languageHint)).toBeVisible();
    // The options the spec lists; Open Gym is out of the MVP.
    await expect(dialog.getByLabel(form.whatLabel)).toContainText(form.what.all);
    await expect(dialog.getByLabel(form.languageLabel)).toContainText(form.languageOptions.visitor);
    await expectNoAxeViolations(page, `the new booking link form in ${appLocale}`);

    // A class link needs a class.
    await dialog.getByLabel(form.whatLabel).selectOption({ label: form.what.class });
    await dialog.getByRole('button', { name: form.create }).click();
    await expect(dialog.getByRole('alert')).toHaveText(form.classRequired);
    await expectNoAxeViolations(page, `the new booking link form with an error in ${appLocale}`);

    await dialog.getByLabel(form.classLabel).selectOption({ label: className(appLocale) });
    await dialog.getByLabel(form.languageLabel).selectOption({ label: form.languageOptions.en });
    await dialog.getByRole('button', { name: form.create }).click();

    await expect(dialog.getByRole('status')).toHaveText(form.created);
    const madeUrl = (await dialog.getByTestId('new-link-url').textContent()) ?? '';
    await dialog.getByRole('button', { name: copy.bookingLinks.copy }).click();
    await expect(dialog.getByRole('status')).toHaveText(copy.bookingLinks.copied);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(madeUrl);
    await expectNoAxeViolations(page, `the created booking link in ${appLocale}`);
    await dialog.getByRole('button', { name: form.done }).click();

    // Listed as "Les: Kracht · Altijd Engels", and the API holds it with that scope and language.
    const classLink = rowOf(
      page,
      copy,
      copy.bookingLinks.scope.class.replace('{class}', className(appLocale)),
    );
    await expect(classLink).toHaveCount(1);
    await expect(classLink).toContainText(copy.bookingLinks.language.en);
    await expect(classLink.locator('code')).toHaveText(madeUrl);
    const stored = await links(page.request, workspaceId);
    expect(stored.filter(({ scope }) => scope === 'class')).toMatchObject([
      { url: madeUrl, language: 'en', active: true },
    ]);

    // The same scope and language again shows the existing link, not a second one.
    await page.getByRole('button', { name: form.open }).click();
    await dialog.getByLabel(form.whatLabel).selectOption({ label: form.what.class });
    await dialog.getByLabel(form.classLabel).selectOption({ label: className(appLocale) });
    await dialog.getByLabel(form.languageLabel).selectOption({ label: form.languageOptions.en });
    await dialog.getByRole('button', { name: form.create }).click();
    await expect(dialog.getByTestId('new-link-url')).toHaveText(madeUrl);
    await dialog.getByRole('button', { name: form.done }).click();
    await expect(classLink).toHaveCount(1);
    expect(
      (await links(page.request, workspaceId)).filter(({ scope }) => scope === 'class'),
    ).toHaveLength(1);

    // One class on a date: the class's dates are listed, and the date link is "Les op di 17 nov: Kracht".
    const dateOption = `${writtenTuesday(appLocale)} 18:00`;
    await page.getByRole('button', { name: form.open }).click();
    await dialog.getByLabel(form.whatLabel).selectOption({ label: form.what.session });
    await dialog.getByLabel(form.classLabel).selectOption({ label: className(appLocale) });
    await expect(dialog.getByLabel(form.dateLabel)).toContainText(dateOption);
    await expectNoAxeViolations(page, `the new booking link form with a date in ${appLocale}`);
    await dialog.getByRole('button', { name: form.create }).click();
    await expect(dialog.getByRole('alert')).toHaveText(form.dateRequired);
    await dialog.getByLabel(form.dateLabel).selectOption({ label: dateOption });
    await dialog.getByRole('button', { name: form.create }).click();
    await expect(dialog.getByRole('status')).toHaveText(form.created);
    const dateUrl = (await dialog.getByTestId('new-link-url').textContent()) ?? '';
    await dialog.getByRole('button', { name: form.done }).click();
    const dateRow = rowOf(
      page,
      copy,
      copy.bookingLinks.scope.session
        .replace('{date}', writtenTuesday(appLocale))
        .replace('{class}', className(appLocale)),
    );
    await expect(dateRow).toContainText(copy.bookingLinks.language.visitor);
    await expect(dateRow.locator('code')).toHaveText(dateUrl);
    const dateLinks = (await links(page.request, workspaceId)).filter(
      ({ scope }) => scope === 'session',
    );
    expect(dateLinks).toMatchObject([{ url: dateUrl, language: 'visitor', active: true }]);

    // Making it again shows the same link, and it is the one the API gets for that session.
    await page.getByRole('button', { name: form.open }).click();
    await dialog.getByLabel(form.whatLabel).selectOption({ label: form.what.session });
    await dialog.getByLabel(form.classLabel).selectOption({ label: className(appLocale) });
    await dialog.getByLabel(form.dateLabel).selectOption({ label: dateOption });
    await dialog.getByRole('button', { name: form.create }).click();
    await expect(dialog.getByTestId('new-link-url')).toHaveText(dateUrl);
    await dialog.getByRole('button', { name: form.done }).click();
    await expect(dateRow).toHaveCount(1);
    const sameAgain = await page.request.post(`/api/v1/workspaces/${workspaceId}/booking-links`, {
      data: { scope: 'session', language: 'visitor', sessionId },
    });
    expect(sameAgain.status()).toBe(200);
    expect(((await sameAgain.json()) as LinkBody).url).toBe(dateUrl);

    // A Groepslessen link in Dutch is one more link, and the standing ones stay first.
    await page.getByRole('button', { name: form.open }).click();
    await dialog.getByLabel(form.whatLabel).selectOption({ label: form.what.group });
    await dialog.getByLabel(form.languageLabel).selectOption({ label: form.languageOptions.nl });
    await dialog.getByRole('button', { name: form.create }).click();
    await expect(dialog.getByRole('status')).toHaveText(form.created);
    await dialog.getByRole('button', { name: form.done }).click();
    const order = await links(page.request, workspaceId);
    expect(order.slice(0, 2).map(({ scope, language }) => `${scope}:${language}`)).toEqual([
      'all:visitor',
      'group:visitor',
    ]);
    await expect(rowOf(page, copy, copy.bookingLinks.language.nl)).toHaveCount(1);
  });

  test('AC2: the date picker lists only the upcoming dates of the class', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await openBookingLinks(page, copy, slug);
    const workspaceId = await gymId(page.request);
    const { classId } = await seedClassDate(page.request, workspaceId);
    const schedule = async (id: string, localDate: string) => {
      const planned = await page.request.post(
        `/api/v1/workspaces/${workspaceId}/group-classes/${id}/dates`,
        { data: { localDate, localStart: '18:00' } },
      );
      expect(planned.status()).toBe(201);
      return ((await planned.json()) as { id: string }).id;
    };
    const nextWeek = new Date(`${tuesday()}T12:00:00Z`);
    nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
    const nextTuesday = nextWeek.toISOString().slice(0, 10);
    const written = (date: string) =>
      new Intl.DateTimeFormat(formattingLocales[appLocale], {
        timeZone: 'Europe/Amsterdam',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(new Date(`${date}T12:00:00Z`));
    // A cancelled Kracht date and a date of another class: neither is offered.
    await cancelSession(await schedule(classId, nextTuesday));
    const boxing = await page.request.post(`/api/v1/workspaces/${workspaceId}/group-classes`, {
      data: { nameNl: 'Boksen', nameEn: 'Boxing', capacity: 8, durationMinutes: 60 },
    });
    const boxingId = ((await boxing.json()) as { groupClass: { id: string } }).groupClass.id;
    const wednesdayDate = new Date(`${tuesday()}T12:00:00Z`);
    wednesdayDate.setUTCDate(wednesdayDate.getUTCDate() + 1);
    const wednesday = wednesdayDate.toISOString().slice(0, 10);
    await schedule(boxingId, wednesday);

    for (const viewport of [undefined, PHONE]) {
      if (viewport) await page.setViewportSize(viewport);
      await page.reload();
      const form = copy.bookingLinks.new;
      await page.getByRole('button', { name: form.open }).click();
      const dialog = page.getByRole('dialog', { name: form.title });
      await dialog.getByLabel(form.whatLabel).selectOption({ label: form.what.session });
      await dialog.getByLabel(form.classLabel).selectOption({ label: className(appLocale) });
      const options = dialog.getByLabel(form.dateLabel).getByRole('option');
      await expect(options).toHaveText([form.dateChoose, `${written(tuesday())} 18:00`]);
      await expectNoAxeViolations(page, `the date picker in ${appLocale}`);
      // Boxing has its own date, and none of Kracht's.
      await dialog.getByLabel(form.classLabel).selectOption({ label: boxingLabel(appLocale) });
      await expect(options).toHaveText([form.dateChoose, `${written(wednesday)} 18:00`]);
      await page.keyboard.press('Escape');
    }
  });

  test('AC7: deactivate a booking link', async ({ page, context, appLocale, messages: copy }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await openBookingLinks(page, copy, slug);
    const workspaceId = await gymId(page.request);
    const { classId } = await seedClassDate(page.request, workspaceId);
    const made = await page.request.post(`/api/v1/workspaces/${workspaceId}/booking-links`, {
      data: { scope: 'class', language: 'en', groupClassId: classId },
    });
    expect(made.status()).toBe(201);
    const link = (await made.json()) as LinkBody;
    await page.reload();
    const dialog = page.getByRole('alertdialog');
    const label = copy.bookingLinks.scope.class.replace('{class}', className(appLocale));
    const row = rowOf(page, copy, label);

    await row.getByRole('button', { name: copy.bookingLinks.deactivate }).click();
    await expect(
      dialog.getByRole('heading', { name: copy.bookingLinks.deactivateDialog.title }),
    ).toBeVisible();
    await expect(dialog.getByText(copy.bookingLinks.deactivateDialog.body)).toBeVisible();
    // A destructive confirm uses the error colour.
    await expect(
      dialog.getByRole('button', { name: copy.bookingLinks.deactivateDialog.confirm }),
    ).toHaveClass(/text-destructive/);
    await expectNoAxeViolations(page, `the deactivate dialog in ${appLocale}`);

    // Terug changes nothing.
    await dialog.getByRole('button', { name: copy.bookingLinks.deactivateDialog.cancel }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).toHaveCount(1);
    await expect(page.getByRole('status')).toHaveCount(0);
    expect((await links(page.request, workspaceId)).find(({ id }) => id === link.id)?.active).toBe(
      true,
    );

    await row.getByRole('button', { name: copy.bookingLinks.deactivate }).click();
    await dialog.getByRole('button', { name: copy.bookingLinks.deactivateDialog.confirm }).click();

    await expect(page.getByRole('status')).toHaveText(copy.bookingLinks.deactivated);
    // It moved under Niet actief, dimmed and without actions.
    await expect(
      page.getByRole('heading', { level: 3, name: copy.bookingLinks.inactiveHeading }),
    ).toBeVisible();
    const inactive = bookingCard(page, copy).locator('tr[data-state="inactive"]');
    await expect(inactive).toHaveCount(1);
    await expect(inactive).toContainText(label);
    await expect(inactive.locator('code')).toHaveText(link.url);
    await expect(inactive).toHaveClass(/text-muted-foreground/);
    await expect(inactive.getByRole('button')).toHaveCount(0);
    await expect(
      bookingCard(page, copy).locator('tr[data-state="active"]').filter({ hasText: label }),
    ).toHaveCount(0);
    expect((await links(page.request, workspaceId)).find(({ id }) => id === link.id)?.active).toBe(
      false,
    );
    await expectNoAxeViolations(page, `TW-07 with an inactive link in ${appLocale}`);
    await page.setViewportSize(PHONE);
    await expect(inactive).toBeVisible();
    await expectNoAxeViolations(page, `TW-07 with an inactive link on a phone in ${appLocale}`);
    await page.setViewportSize({ width: 1280, height: 800 });

    // A new link for the same scope gets a new code.
    const again = await page.request.post(`/api/v1/workspaces/${workspaceId}/booking-links`, {
      data: { scope: 'class', language: 'en', groupClassId: classId },
    });
    expect(again.status()).toBe(201);
    expect(((await again.json()) as LinkBody).url).not.toBe(link.url);
  });

  test("AC9: Trainer's read-only TW-07", async ({ page, context, appLocale, messages: copy }) => {
    const { sarah, slug } = await team();
    const code = await joinCodeOf(slug);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signInWithSession(context, sarah);
    await openBookingLinks(page, copy, slug);
    const workspaceId = await gymId(page.request);
    const stored = await links(page.request, workspaceId);

    await expect(
      page.getByRole('region', { name: copy.joinLink.title }).getByTestId('join-link-url'),
    ).toHaveText(new RegExp(`/j/${code}$`));
    await expect(
      page.getByText(
        copy.bookingLinks.trainerNote.replace(
          '{Words}',
          trainerWordForms('trainer', appLocale).Words,
        ),
      ),
    ).toBeVisible();
    const rows = bookingCard(page, copy).getByRole('row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText(copy.bookingLinks.scope.all);
    await expect(rows.nth(2)).toContainText(copy.bookingLinks.scope.group);
    // She copies a link; she has no Nieuwe boekingslink, Deactiveren or Vernieuwen.
    await rows.nth(1).getByRole('button', { name: copy.bookingLinks.copy }).click();
    await expect(page.getByRole('status')).toHaveText(copy.bookingLinks.copied);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(stored[0]?.url);
    await expect(page.getByRole('button', { name: copy.bookingLinks.new.open })).toHaveCount(0);
    await expect(page.getByRole('button', { name: copy.bookingLinks.deactivate })).toHaveCount(0);
    await expect(page.getByRole('button', { name: copy.joinLink.renew })).toHaveCount(0);
    await expectNoAxeViolations(page, `TW-07 of Sarah in ${appLocale}`);

    // The API says the same: she copies, she doesn't make or stop (other than a date link).
    const forbidden = await page.request.post(`/api/v1/workspaces/${workspaceId}/booking-links`, {
      data: { scope: 'all', language: 'visitor' },
    });
    expect(forbidden.status()).toBe(403);
    expect(
      (
        await page.request.post(
          `/api/v1/workspaces/${workspaceId}/booking-links/${stored[0]?.id}/deactivate`,
        )
      ).status(),
    ).toBe(403);
  });

  test("AC8: copy a date's link", async ({ page, context, appLocale, messages: copy }) => {
    const { john, slug } = await team();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const { classId, sessionId } = await seedClassDate(page.request, workspaceId);

    await page.goto(`/w/${slug}/classes/${classId}/${sessionId}`);
    await expect(page.getByRole('button', { name: copy.classes.date.edit })).toBeVisible();
    await page.getByRole('button', { name: copy.bookingLinks.copyBooking }).click();

    await expect(page.getByRole('status')).toHaveText(copy.bookingLinks.copied);
    const first = await page.evaluate(() => navigator.clipboard.readText());
    expect(first).toMatch(/^https?:\/\/.+\/l\/[a-z0-9]{8}$/);
    await expectNoAxeViolations(page, `CO-01 after copying the link in ${appLocale}`);

    // A second copy gives the same link.
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await page.getByRole('button', { name: copy.bookingLinks.copyBooking }).click();
    await expect(page.getByRole('status')).toHaveText(copy.bookingLinks.copied);
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(first);
    const dateLinks = (await links(page.request, workspaceId)).filter(
      ({ scope }) => scope === 'session',
    );
    expect(dateLinks).toMatchObject([{ url: first, language: 'visitor' }]);

    // TW-07 lists "Les op di 17 nov: Kracht".
    await openBookingLinks(page, copy, slug);
    const row = rowOf(
      page,
      copy,
      copy.bookingLinks.scope.session
        .replace('{date}', writtenTuesday(appLocale))
        .replace('{class}', className(appLocale)),
    );
    await expect(row).toHaveCount(1);
    await expect(row.locator('code')).toHaveText(first);
  });

  test('AC8: when the clipboard refuses, CO-01 shows the date’s link to select by hand', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.addInitScript(() => {
      // A browser whose clipboard refuses the write (a click permission that ran out).
      Object.defineProperty(window, 'ClipboardItem', { value: undefined });
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('NotAllowedError')) },
      });
    });
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const { classId, sessionId } = await seedClassDate(page.request, workspaceId);

    await page.goto(`/w/${slug}/classes/${classId}/${sessionId}`);
    await expect(page.getByRole('button', { name: copy.classes.date.edit })).toBeVisible();
    await page.getByRole('button', { name: copy.bookingLinks.copyBooking }).click();

    await expect(
      page.getByRole('alert').filter({ hasText: copy.bookingLinks.errors.copy }),
    ).toBeVisible();
    const field = page.getByRole('textbox', { name: copy.bookingLinks.linkLabel });
    await expect(field).toHaveAttribute('readonly', '');
    const [stored] = (await links(page.request, workspaceId)).filter(
      ({ scope }) => scope === 'session',
    );
    await expect(field).toHaveValue(stored?.url ?? '');
    await field.focus();
    expect(await field.evaluate((input: HTMLInputElement) => input.selectionEnd)).toBe(
      stored?.url.length,
    );
    await expectNoAxeViolations(page, `CO-01 with the link to select in ${appLocale}`);
  });

  test('AC9: a Trainer copies the same date’s link from CO-01', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, sarah, slug } = await team();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const { classId, sessionId } = await seedClassDate(page.request, workspaceId);
    const johns = await page.request.post(`/api/v1/workspaces/${workspaceId}/booking-links`, {
      data: { scope: 'session', language: 'visitor', sessionId },
    });
    expect(johns.status()).toBe(201);
    const { url } = (await johns.json()) as LinkBody;

    await context.clearCookies();
    await signInWithSession(context, sarah);
    await page.goto(`/w/${slug}/classes/${classId}/${sessionId}`);
    // She sees no other action than this one.
    await expect(page.getByRole('button', { name: copy.classes.date.edit })).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('button')).toHaveCount(1);
    await page.getByRole('button', { name: copy.bookingLinks.copyBooking }).click();

    await expect(page.getByRole('status')).toHaveText(copy.bookingLinks.copied);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
    await expectNoAxeViolations(page, `CO-01 of Sarah in ${appLocale}`);
  });

  test('a cancelled or past class date shows no Boekingslink kopiëren', async ({
    page,
    context,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const { classId, sessionId } = await seedClassDate(page.request, workspaceId);
    const other = await page.request.post(
      `/api/v1/workspaces/${workspaceId}/group-classes/${classId}/dates`,
      { data: { localDate: tuesday(), localStart: '19:30' } },
    );
    expect(other.status()).toBe(201);
    const { id: pastId } = (await other.json()) as { id: string };

    // Open date: it has the button.
    await page.goto(`/w/${slug}/classes/${classId}/${sessionId}`);
    await expect(page.getByRole('button', { name: copy.bookingLinks.copyBooking })).toBeVisible();

    await cancelSession(sessionId);
    await page.reload();
    // CO-01 of a cancelled date has no *Wijzigen* (F026) and no *Bookings* row; the page heading
    // and the *When* row tell that it has loaded.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(copy.classes.date.whenLabel, { exact: true })).toBeVisible();
    await expect(page.getByText(copy.classes.date.bookedLabel, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: copy.classes.date.edit })).toHaveCount(0);
    await expect(page.getByRole('button', { name: copy.bookingLinks.copyBooking })).toHaveCount(0);

    await passSession(pastId);
    await page.goto(`/w/${slug}/classes/${classId}/${pastId}`);
    await expect(page.getByRole('button', { name: copy.classes.date.edit })).toBeVisible();
    await expect(page.getByRole('button', { name: copy.bookingLinks.copyBooking })).toHaveCount(0);
  });

  /**
   * Kracht, in whichever of its two names the Agenda writes.
   *
   * This regex is a workaround for bug #1595, not intended behaviour: the Agenda's server-side
   * fetch forwards only the cookie, so the API answers in English for an account with no stored
   * language. When #1595 is fixed, go back to `className(appLocale)` here.
   */
  const KRACHT = /Kracht|Strength/;

  /** The Agenda's week of `date`, and the quick view of the block of that week that has `text`, starting at `time`. */
  async function openQuickView(
    page: Page,
    slug: string,
    date: string,
    text: string | RegExp,
    time = '',
  ) {
    await page.goto(`/w/${slug}/calendar?date=${date}&view=week`);
    await page
      .getByRole('main')
      .locator(`button[aria-haspopup="dialog"][aria-label*=", ${time}"]`)
      .filter({ hasText: text })
      .click();
    return page.getByRole('dialog');
  }

  test("AC8: copy a date's link from the quick view", async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const { john, sarah, slug } = await team();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const { sessionId } = await seedClassDate(page.request, workspaceId);
    const made = await page.request.post(`/api/v1/workspaces/${workspaceId}/clients`, {
      data: { name: 'Mark Jansen', email: 'mark@example.com' },
    });
    expect(made.status()).toBe(201);
    const { id: clientId } = (await made.json()) as { id: string };
    const privateSession = await page.request.post(
      `/api/v1/workspaces/${workspaceId}/sessions/private`,
      {
        data: {
          clientId,
          localDate: tuesday(),
          localStart: '07:00',
          durationMinutes: 60,
          notify: false,
        },
      },
    );
    expect(privateSession.status()).toBe(201);
    const name = copy.bookingLinks.copyBooking;
    const week = copy.workspaceCalendar;

    // John opens the quick view of Tuesday's Kracht: a share icon button right after the class name
    // in the header, named and with its tooltip by Boekingslink kopiëren, and not in the footer
    // row of actions beside Openen.
    let dialog = await openQuickView(page, slug, tuesday(), KRACHT);
    const open = dialog.getByRole('link', { name: week.open });
    await expect(open).toBeVisible();
    const copyButton = dialog.getByRole('button', { name });
    await expect(copyButton).toBeVisible();
    await expect(copyButton).toHaveText('');
    await expect(copyButton).toHaveAttribute('title', name);
    await expect(copyButton.locator('svg')).toHaveCount(1);
    await expect(copyButton.locator('svg path')).toHaveAttribute(
      'd',
      'M12 3.5v11M7.5 8L12 3.5 16.5 8M5 13v6.5h14V13',
    );
    await expect(
      dialog.locator('[data-slot="dialog-header"]').getByRole('button', { name }),
    ).toBeVisible();
    await expect(open.locator('xpath=..').getByRole('button', { name })).toHaveCount(0);
    const title = dialog.getByRole('heading', { name: KRACHT });
    const titleBox = await title.boundingBox();
    const buttonBox = await copyButton.boundingBox();
    if (!titleBox || !buttonBox) throw new Error('the title and the button have a box');
    // On one row: the button starts where the title ends and is centred on it.
    const gap = buttonBox.x - (titleBox.x + titleBox.width);
    expect(gap).toBeGreaterThanOrEqual(-1);
    expect(gap).toBeLessThan(16);
    expect(
      Math.abs(buttonBox.y + buttonBox.height / 2 - (titleBox.y + titleBox.height / 2)),
    ).toBeLessThan(6);
    await expectNoAxeViolations(page, `WC-05 with Boekingslink kopiëren in ${appLocale}`);

    await copyButton.click();
    await expect(page.getByRole('status')).toHaveText(copy.bookingLinks.copied);
    const first = await page.evaluate(() => navigator.clipboard.readText());
    expect(first).toMatch(/^https?:\/\/.+\/l\/[a-z0-9]{8}$/);
    await expectNoAxeViolations(page, `WC-05 after copying the link in ${appLocale}`);

    // It is the link CO-01 copies: the same call gets or makes the date's one link.
    const same = await page.request.post(`/api/v1/workspaces/${workspaceId}/booking-links`, {
      data: { scope: 'session', language: 'visitor', sessionId },
    });
    expect(((await same.json()) as LinkBody).url).toBe(first);
    expect(
      (await links(page.request, workspaceId)).filter(({ scope }) => scope === 'session'),
    ).toMatchObject([{ url: first, language: 'visitor' }]);

    // A private session's quick view has no such action.
    await page.keyboard.press('Escape');
    dialog = await openQuickView(page, slug, tuesday(), 'Mark Jansen');
    await expect(dialog.getByRole('link', { name: week.open })).toBeVisible();
    await expect(dialog.getByRole('button', { name })).toHaveCount(0);

    // Sarah copies it too, from a class date that is John's.
    await context.clearCookies();
    await signInWithSession(context, sarah);
    await page.evaluate(() => navigator.clipboard.writeText(''));
    dialog = await openQuickView(page, slug, tuesday(), KRACHT);
    await expect(dialog.getByRole('link', { name: week.open })).toBeVisible();
    await dialog.getByRole('button', { name }).click();
    await expect(page.getByRole('status')).toHaveText(copy.bookingLinks.copied);
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(first);
    await expectNoAxeViolations(page, `WC-05 of Sarah in ${appLocale}`);

    // And none on John's private session, which she sees as Openen only.
    await page.keyboard.press('Escape');
    dialog = await openQuickView(page, slug, tuesday(), 'Mark Jansen');
    await expect(dialog.getByRole('link', { name: week.open })).toBeVisible();
    await expect(dialog.getByRole('button', { name })).toHaveCount(0);
  });

  test('AC8: the quick view of a cancelled or past class date has no Boekingslink kopiëren', async ({
    page,
    context,
    messages: copy,
  }) => {
    test.slow();
    const { john, slug } = await team();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await gymId(page.request);
    const { classId, sessionId } = await seedClassDate(page.request, workspaceId);
    const later = await page.request.post(
      `/api/v1/workspaces/${workspaceId}/group-classes/${classId}/dates`,
      { data: { localDate: tuesday(), localStart: '19:30' } },
    );
    expect(later.status()).toBe(201);
    const { id: pastId } = (await later.json()) as { id: string };
    const name = copy.bookingLinks.copyBooking;

    // The open date has it.
    let dialog = await openQuickView(page, slug, tuesday(), KRACHT, '18:00');
    await expect(dialog.getByRole('link', { name: copy.workspaceCalendar.open })).toBeVisible();
    await expect(dialog.getByRole('button', { name })).toBeVisible();

    // Cancelled: the quick view still opens (Openen), without the button.
    await cancelSession(sessionId);
    dialog = await openQuickView(page, slug, tuesday(), KRACHT, '18:00');
    await expect(dialog.getByRole('link', { name: copy.workspaceCalendar.open })).toBeVisible();
    await expect(dialog.getByRole('button', { name })).toHaveCount(0);

    // Past: the second date, moved 60 days back, in the week it is now in.
    await passSession(pastId);
    const past = new Date(`${tuesday()}T12:00:00Z`);
    past.setUTCDate(past.getUTCDate() - 60);
    dialog = await openQuickView(page, slug, past.toISOString().slice(0, 10), KRACHT);
    await expect(dialog.getByRole('link', { name: copy.workspaceCalendar.open })).toBeVisible();
    await expect(dialog.getByRole('button', { name })).toHaveCount(0);
  });
});
