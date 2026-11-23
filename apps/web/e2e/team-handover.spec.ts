import { messages as catalogs, formattingLocales } from '@fivvi/i18n';
import type { Page } from '@playwright/test';
import { createTranslator } from 'next-intl';
import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  joinTeam,
  newAddress,
  passSession,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';
import { emailsTo, waitForEmails } from './lettermint';
import {
  GYM,
  inDays,
  seedClassDate,
  seedClient,
  seedKrachtClass,
  seedPrivate,
  storedSession,
  team,
  trainerChangeEmail,
  wording,
} from './trainer-assignment-world';

// F023 (spec #459, ticket #540): removing a trainer with sessions in the coming weeks hands them
// over on *Trainers* (TW-06). Sarah has, in the next 2 weeks, 3 private sessions and 4 Kracht dates
// and, after them, 2 private sessions and 2 Kracht dates; John (Owner) removes her. Dates are
// relative to the day the spec runs.

test.describe('F023 removing a trainer with a handover', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  /** Sarah's sessions, as the data a spec starts from: the ones inside the next 2 weeks and the later ones. */
  async function seed(page: Page, context: Parameters<typeof team>[1]) {
    const w = await team(page, context);
    const sarah = w.trainer('Sarah');
    const anna = await seedClient(page.request, w.base, 'Anna de Vries');
    const mark = await seedClient(page.request, w.base, 'Mark Jansen', 'en');
    const lisa = await seedClient(page.request, w.base, 'Lisa Smit');
    const later = await seedClient(page.request, w.base, 'Piet Later');
    const plan = (client: { id: string }, day: number, start: string) =>
      seedPrivate(page.request, w.base, {
        clientId: client.id,
        trainerId: sarah,
        localDate: inDays(day),
        localStart: start,
      });
    const privates = [
      await plan(anna, 3, '09:00'),
      await plan(mark, 5, '09:00'),
      await plan(lisa, 7, '09:00'),
    ];
    const laterPrivates = [await plan(later, 20, '09:00'), await plan(later, 21, '09:00')];
    const classId = await seedKrachtClass(page.request, w.base, sarah);
    const classes = [];
    for (const day of [2, 4, 6, 8]) {
      classes.push(await seedClassDate(page.request, w.base, classId, inDays(day), sarah));
    }
    const laterClasses = [];
    for (const day of [20, 22]) {
      laterClasses.push(await seedClassDate(page.request, w.base, classId, inDays(day), sarah));
    }
    // A session that has passed keeps Sarah: the API plans none in the past, so one is moved back.
    const past = await plan(anna, 4, '12:00');
    await passSession(past.id);
    return {
      ...w,
      anna,
      mark,
      lisa,
      later,
      privates: privates.map(({ id }) => id),
      laterPrivates: laterPrivates.map(({ id }) => id),
      classes,
      laterClasses,
      past: past.id,
    };
  }

  /** The row of `name` on *Trainers* and its remove action. */
  async function openRemoval(page: Page, slug: string, name: string, remove: string) {
    await page.goto(`/w/${slug}/trainers`);
    await page
      .getByRole('row', { name: new RegExp(name) })
      .getByRole('button', { name: remove })
      .click();
  }

  test('AC9: the dialog shows the counts; Tom takes the private sessions, the classes get Trainer nodig, Sarah goes in one step and her past sessions keep her', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await seed(page, context);
    const text = wording(appLocale, copy);
    const handover = createTranslator({
      locale: formattingLocales[appLocale],
      messages: copy,
      namespace: 'team.handover',
    });
    await openRemoval(page, w.slug, 'Sarah', copy.team.remove);

    const dialog = page.getByRole('dialog', {
      name: copy.team.removeDialog.title.replace('{name}', 'Sarah'),
    });
    await expect(
      dialog.getByText(
        handover('nextTwoWeeks', {
          parts: handover('partsJoin', {
            first: handover('classesCount', { count: 4 }),
            second: handover('privateCount', { count: 3 }),
          }),
        }),
      ),
    ).toBeVisible();
    // Sessions after the next 2 weeks get Trainer nodig and are assigned later, under Aandacht nodig.
    await expect(dialog.getByText(handover('later', { ...text.word, count: 4 }))).toBeVisible();
    await expect(dialog.getByRole('button', { name: handover('submit') })).toBeDisabled();
    await expect(dialog.getByRole('checkbox', { name: handover('notify') })).toBeChecked();
    await expectNoAxeViolations(page, `the removal handover in ${appLocale}`);

    await dialog.getByLabel(handover('privateLabel')).selectOption({ label: 'Tom' });
    await dialog.getByLabel(handover('classesLabel')).selectOption({ label: handover('nobody') });
    await dialog.getByRole('button', { name: handover('submit') }).click();

    await expect(
      page.getByRole('status').filter({ hasText: copy.team.removed.replace('{name}', 'Sarah') }),
    ).toBeVisible();
    await expect(page.getByRole('row', { name: /Sarah/ })).toHaveCount(0);
    for (const id of w.privates) {
      expect((await storedSession(page.request, w.base, id)).trainer?.name).toBe('Tom');
    }
    // The classes of the next 2 weeks and every later session: Trainer nodig, none cancelled.
    for (const id of [...w.classes, ...w.laterClasses, ...w.laterPrivates]) {
      const stored = await storedSession(page.request, w.base, id);
      expect(stored.trainer).toBeUndefined();
      expect(stored.status).toBe('scheduled');
    }
    // Her past session still shows Sarah.
    expect((await storedSession(page.request, w.base, w.past)).trainer?.name).toBe('Sarah');
    // Anna, a client of a handed-over session, is told about Tom.
    await trainerChangeEmail(w.anna.email, 'Tom');
  });

  test('AC9a: Niemand for the private sessions shows the note, cancels them with the email and leaves the later sessions alone', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await seed(page, context);
    const text = wording(appLocale, copy);
    const handover = createTranslator({
      locale: formattingLocales[appLocale],
      messages: copy,
      namespace: 'team.handover',
    });
    await openRemoval(page, w.slug, 'Sarah', copy.team.remove);

    const dialog = page.getByRole('dialog', {
      name: copy.team.removeDialog.title.replace('{name}', 'Sarah'),
    });
    await expect(dialog.getByText(handover('nobodyNote', { ...text.word }))).toHaveCount(0);
    await dialog.getByLabel(handover('privateLabel')).selectOption({ label: handover('nobody') });
    await expect(dialog.getByText(handover('nobodyNote', { ...text.word }))).toBeVisible();
    await dialog.getByLabel(handover('classesLabel')).selectOption({ label: handover('nobody') });
    await expectNoAxeViolations(page, `the removal handover with Niemand in ${appLocale}`);
    await dialog.getByRole('button', { name: handover('submit') }).click();

    await expect(
      page.getByRole('status').filter({ hasText: copy.team.removed.replace('{name}', 'Sarah') }),
    ).toBeVisible();
    for (const id of w.privates) {
      expect((await storedSession(page.request, w.base, id)).status).toBe('cancelled');
    }
    for (const id of w.classes) {
      const stored = await storedSession(page.request, w.base, id);
      expect(stored.trainer).toBeUndefined();
      expect(stored.status).toBe('scheduled');
    }
    // Each client of a cancelled session gets an email, in their language (Mark's is English)...
    const cancelled = catalogs.en.email.privateSessionCancelled.subject.split('{date}')[0] ?? '';
    await expect
      .poll(async () =>
        (await waitForEmails(w.mark.email)).some((email) => email.subject.startsWith(cancelled)),
      )
      .toBe(true);
    // ...and the sessions after the next 2 weeks are not cancelled and tell nobody.
    for (const id of [...w.laterPrivates, ...w.laterClasses]) {
      const stored = await storedSession(page.request, w.base, id);
      expect(stored.trainer).toBeUndefined();
      expect(stored.status).toBe('scheduled');
    }
    expect(await emailsTo(w.later.email)).toHaveLength(0);
  });

  test('AC18: with Klanten informeren unchecked the request says so', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await seed(page, context);
    const handover = createTranslator({
      locale: formattingLocales[appLocale],
      messages: copy,
      namespace: 'team.handover',
    });
    await openRemoval(page, w.slug, 'Sarah', copy.team.remove);
    const dialog = page.getByRole('dialog', {
      name: copy.team.removeDialog.title.replace('{name}', 'Sarah'),
    });
    await dialog.getByLabel(handover('privateLabel')).selectOption({ label: 'Tom' });
    await dialog.getByLabel(handover('classesLabel')).selectOption({ label: 'Tom' });
    await dialog.getByRole('checkbox', { name: handover('notify') }).uncheck();
    const request = page.waitForRequest(
      (candidate) => candidate.method() === 'DELETE' && candidate.url().includes('/team-members/'),
    );
    await dialog.getByRole('button', { name: handover('submit') }).click();

    expect((await request).postDataJSON()).toEqual({
      privateTo: w.trainer('Tom'),
      classesTo: w.trainer('Tom'),
      notifyClients: false,
    });
    await expect(
      page.getByRole('status').filter({ hasText: copy.team.removed.replace('{name}', 'Sarah') }),
    ).toBeVisible();
    for (const id of w.classes) {
      expect((await storedSession(page.request, w.base, id)).trainer?.name).toBe('Tom');
    }
  });

  test('AC10: with no other trainer only Niemand is there, with the note, and Sarah can still be removed; a trainer with nothing coming gets F003’s dialog', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const [john, sarah, tom] = [newAddress('john'), newAddress('sarah'), newAddress('tom')];
    await createAccount(john, undefined, 'John');
    await createAccount(sarah, undefined, 'Sarah');
    await createAccount(tom, undefined, 'Tom');
    // John does not train here: Sarah and Tom are the trainers.
    const slug = await createGymWithTrainer(john, GYM, 'owner', false);
    await joinTeam(sarah, slug, 'trainer');
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaces = (await (await page.request.get('/api/v1/me/workspaces')).json()) as {
      workspaceId: string;
      name: string;
    }[];
    const base = `/api/v1/workspaces/${workspaces.find((entry) => entry.name === GYM)?.workspaceId}`;
    const trainers = (await (await page.request.get(`${base}/trainers`)).json()) as {
      id: string;
      name: string;
    }[];
    const sarahId = trainers.find((entry) => entry.name === 'Sarah')?.id ?? '';
    const text = wording(appLocale, copy);
    const handover = createTranslator({
      locale: formattingLocales[appLocale],
      messages: copy,
      namespace: 'team.handover',
    });
    const anna = await seedClient(page.request, base, 'Anna de Vries');
    const planned = await seedPrivate(page.request, base, {
      clientId: anna.id,
      trainerId: sarahId,
      localDate: inDays(3),
      localStart: '09:00',
    });
    await openRemoval(page, slug, 'Sarah', copy.team.remove);

    const dialog = page.getByRole('dialog', {
      name: copy.team.removeDialog.title.replace('{name}', 'Sarah'),
    });
    const privateSelect = dialog.getByLabel(handover('privateLabel'));
    await expect(privateSelect.locator('option')).toHaveText([handover('nobody')]);
    await expect(dialog.getByText(handover('nobodyNote', { ...text.word }))).toBeVisible();
    await expectNoAxeViolations(
      page,
      `the removal handover without other trainers in ${appLocale}`,
    );
    await dialog.getByRole('button', { name: handover('submit') }).click();
    await expect(
      page.getByRole('status').filter({ hasText: copy.team.removed.replace('{name}', 'Sarah') }),
    ).toBeVisible();
    expect((await storedSession(page.request, base, planned.id)).status).toBe('cancelled');

    // Tom, with nothing coming, gets F003's plain dialog.
    await joinTeam(tom, slug, 'trainer');
    await openRemoval(page, slug, 'Tom', copy.team.remove);
    const plain = page.getByRole('alertdialog', {
      name: copy.team.removeDialog.title.replace('{name}', 'Tom'),
    });
    await expect(plain).toBeVisible();
    await expect(plain.getByRole('button', { name: copy.team.removeDialog.confirm })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await plain.getByRole('button', { name: copy.team.removeDialog.cancel }).click();
  });
});
