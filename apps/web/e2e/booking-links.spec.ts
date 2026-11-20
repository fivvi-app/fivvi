import { formattingLocales, type Locale, type Messages } from '@fivvi/i18n';
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

// F037 (spec #473, tickets #966 and #968): TW-07 *Boekingslinks* (the join-link card and the booking links,
// *Nieuwe boekingslink*, *Deactiveren*) and *Boekingslink kopiëren* on CO-01. Copy comes from the catalogs. Each spec has accounts and workspaces of its own: John is the Owner and Sarah a
// Trainer of John's Gym; the class is Kracht (Strength in English) every Tuesday 18:00. The dates are
// relative to the day the spec runs. The form's *Eén les op een datum* waits for an API that lists a
// class's upcoming dates, so the date links of this spec are made through CO-01 or the API.
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

    // A date link (made through the API here) is listed as "Les op di 17 nov: Kracht".
    const dateLink = await page.request.post(`/api/v1/workspaces/${workspaceId}/booking-links`, {
      data: { scope: 'session', language: 'visitor', sessionId },
    });
    expect(dateLink.status()).toBe(201);
    await page.reload();
    await expect(
      rowOf(
        page,
        copy,
        copy.bookingLinks.scope.session
          .replace('{date}', writtenTuesday(appLocale))
          .replace('{class}', className(appLocale)),
      ),
    ).toContainText(copy.bookingLinks.language.visitor);

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
    await expect(page.getByText(copy.bookingLinks.trainerNote)).toBeVisible();
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
    await expect(page.getByRole('button', { name: copy.classes.date.edit })).toBeVisible();
    await expect(page.getByRole('button', { name: copy.bookingLinks.copyBooking })).toHaveCount(0);

    await passSession(pastId);
    await page.goto(`/w/${slug}/classes/${classId}/${pastId}`);
    await expect(page.getByRole('button', { name: copy.classes.date.edit })).toBeVisible();
    await expect(page.getByRole('button', { name: copy.bookingLinks.copyBooking })).toHaveCount(0);
  });
});
