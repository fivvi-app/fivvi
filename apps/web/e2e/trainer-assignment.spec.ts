import { messages as catalogs } from '@fivvi/i18n';
import {
  bookParticipant,
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  newAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';
import {
  GYM,
  seedBoxing,
  seedClient,
  seedKracht,
  seedPrivate,
  shift,
  storedSession,
  team,
  thursday,
  trainerChangeEmail,
  tuesday,
  wording,
} from './trainer-assignment-world';

// F023 (spec #459, ticket #539): CO-02 *Trainer toewijzen* / *Trainer vervangen* on a class date
// (CO-01) and *Trainer wijzigen* on a private session, with the double-booking warning (PS-07),
// the conflict hints, the notify box and what a Trainer cannot do. The helpers and the people are
// in trainer-assignment-world.ts.

test.describe('F023 CO-02 and Trainer wijzigen on the web', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  test('AC1: John assigns Tom to Boxing from CO-01; the dialog asks who teaches it, and Aandacht nodig no longer lists it', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const boxing = await seedBoxing(page.request, w.base);
    await page.goto(`/w/${w.slug}/classes/${boxing.classId}/${boxing.sessionId}`);

    await expect(page.getByText(text.classes('trainerNeeded', { ...text.word }))).toBeVisible();
    await page.getByRole('button', { name: text.titleAssign }).click();
    const dialog = page.getByRole('dialog', { name: text.titleAssign });
    await expect(dialog.getByText(text.t('whoAssign'))).toBeVisible();
    await expect(dialog.getByText(text.t('currently', { name: '' }).trim())).toHaveCount(0);
    await expect(dialog.getByText(text.t('bookingsStay'))).toBeVisible();
    await expect(dialog.getByRole('radio')).toHaveCount(4);
    await expectNoAxeViolations(page, `CO-02 Trainer toewijzen in ${appLocale}`);

    await dialog.getByRole('radio', { name: 'Tom' }).check();
    await dialog.getByRole('button', { name: text.t('submitAssign') }).click();

    await expect(
      page.getByRole('status').filter({
        hasText: text.t('doneClass', {
          trainer: 'Tom',
          class: 'Boxing',
          date: text.day((await storedSession(page.request, w.base, boxing.sessionId)).startsAt),
        }),
      }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('main').getByText('Tom', { exact: true })).toBeVisible();
    expect((await storedSession(page.request, w.base, boxing.sessionId)).trainer?.name).toBe('Tom');
    // Aandacht nodig on the Dashboard no longer lists Boxing.
    await page.goto(`/w/${w.slug}`);
    await expect(
      page.getByRole('heading', { name: copy.workspaceDashboard.attentionTitle }),
    ).toBeVisible();
    await expect(
      page.getByRole('main').getByText(copy.workspaceDashboard.attentionNone),
    ).toBeVisible();
  });

  test('AC2: Mike becomes the regular trainer from a date on: the dialog says so, the later dates get him and the earlier one keeps Sarah', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const kracht = await seedKracht(page.request, w.base, w.trainer('Sarah'));
    const [first, second, third] = kracht.dates;
    if (!first || !second || !third) throw new Error('Kracht has fewer than three dates.');
    const secondDate = shift(tuesday(), 7);
    await page.goto(`/w/${w.slug}/classes/${kracht.classId}/${second}`);

    await page.getByRole('button', { name: text.titleSubstitute }).click();
    const dialog = page.getByRole('dialog', { name: text.titleSubstitute });
    await expect(dialog.getByText(text.t('currently', { name: 'Sarah' }))).toBeVisible();
    await expect(dialog.getByText(text.t('whoSubstitute'))).toBeVisible();
    // Alleen deze les is F024's: only Deze en alle volgende lessen is offered for a date with a trainer.
    await expect(dialog.getByRole('radio', { name: text.t('scopeThis') })).toHaveCount(0);
    // The current trainer is not among the choices.
    await expect(dialog.getByRole('radio', { name: 'Sarah' })).toHaveCount(0);
    await dialog.getByRole('radio', { name: 'Mike' }).check();
    await expect(
      dialog.getByText(
        text.t('followingLine', {
          ...text.word,
          trainer: 'Mike',
          date: text.longDate(secondDate),
          class: text.kracht,
        }),
      ),
    ).toBeVisible();
    await expectNoAxeViolations(page, `CO-02 Trainer vervangen in ${appLocale}`);
    await dialog.getByRole('button', { name: text.t('submitSubstitute') }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('status').filter({
        hasText: text.t('doneClass', {
          trainer: 'Mike',
          class: text.kracht,
          date: text.day((await storedSession(page.request, w.base, second)).startsAt),
        }),
      }),
    ).toBeVisible();
    expect((await storedSession(page.request, w.base, second)).trainer?.name).toBe('Mike');
    expect((await storedSession(page.request, w.base, third)).trainer?.name).toBe('Mike');
    expect((await storedSession(page.request, w.base, first)).trainer?.name).toBe('Sarah');
  });

  test('AC3: Mike’s row says he already has a private session at 18:30; with Deze en alle volgende lessen the later conflict is counted', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const kracht = await seedKracht(page.request, w.base, w.trainer('Sarah'));
    const [, second] = kracht.dates;
    if (!second) throw new Error('Kracht has fewer than two dates.');
    const anna = await seedClient(page.request, w.base, 'Anna de Vries');
    // Mike has Anna on the second and the third Tuesday at 18:30.
    for (const week of [7, 14]) {
      await seedPrivate(page.request, w.base, {
        clientId: anna.id,
        trainerId: w.trainer('Mike'),
        localDate: shift(tuesday(), week),
        localStart: '18:30',
      });
    }
    await page.goto(`/w/${w.slug}/classes/${kracht.classId}/${second}`);

    await page.getByRole('button', { name: text.titleSubstitute }).click();
    const dialog = page.getByRole('dialog', { name: text.titleSubstitute });
    await expect(
      dialog.getByRole('radio', {
        name: new RegExp(text.t('conflictPrivate', { time: '18:30' }).replace(/[()]/g, '\\$&')),
      }),
    ).toHaveCount(1);
    // Tom has nothing then: no hint on his row.
    await expect(dialog.getByRole('radio', { name: 'Tom', exact: true })).toHaveCount(1);
    await dialog.getByRole('radio', { name: /Mike/ }).check();
    await expect(
      dialog.getByText(text.t('laterConflicts', { trainer: 'Mike', count: 1 })),
    ).toBeVisible();
  });

  test('AC4: nothing of Sarah Personal Training shows in John’s Gym’s dialog or in what the API answers', async ({
    page,
    context,
    browser,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const boxing = await seedBoxing(page.request, w.base);
    // Sarah is also the Owner of her own business, with a client and a session at the same time.
    await createGymWithTrainer(w.sarah, 'Sarah Personal Training', 'owner');
    const hers = await browser.newContext({ extraHTTPHeaders: clientIpHeaders() });
    await signInWithSession(hers, w.sarah);
    const tab = await hers.newPage();
    await tab.goto('/');
    const workspaces = (await (await tab.request.get('/api/v1/me/workspaces')).json()) as {
      workspaceId: string;
      name: string;
    }[];
    const herBase = `/api/v1/workspaces/${
      workspaces.find((workspace) => workspace.name === 'Sarah Personal Training')?.workspaceId
    }`;
    const secret = await seedClient(tab.request, herBase, 'Geheime Klant');
    const herTrainers = (await (await tab.request.get(`${herBase}/trainers`)).json()) as {
      id: string;
      name: string;
    }[];
    const hersSession = await seedPrivate(tab.request, herBase, {
      clientId: secret.id,
      trainerId: herTrainers[0]?.id ?? '',
      localDate: thursday(),
      localStart: '19:15',
    });
    await hers.close();

    await page.goto(`/w/${w.slug}/classes/${boxing.classId}/${boxing.sessionId}`);
    await page.getByRole('button', { name: text.titleAssign }).click();
    const dialog = page.getByRole('dialog', { name: text.titleAssign });
    // Sarah has something at that time, in her own business: John's Gym shows no hint, no count, no warning.
    await expect(dialog.getByRole('radio', { name: 'Sarah', exact: true })).toBeVisible();
    await expect(dialog.getByText(/Geheime|Personal Training/)).toHaveCount(0);
    await expect(dialog.getByText(/\(\d\d:\d\d\)/)).toHaveCount(0);
    const candidates = await page.request.get(
      `${w.base}/sessions/${boxing.sessionId}/trainer-candidates`,
    );
    const body = await candidates.text();
    expect(body).not.toContain(hersSession.id);
    expect(body).not.toContain('Geheime');
    await dialog.getByRole('radio', { name: 'Sarah', exact: true }).check();
    await dialog.getByRole('button', { name: text.t('submitAssign') }).click();
    await expect
      .poll(async () => (await storedSession(page.request, w.base, boxing.sessionId)).trainer?.name)
      .toBe('Sarah');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('PS-07: choosing Mike over his private session warns; Terug keeps the dialog, Toch opslaan assigns him', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const boxing = await seedBoxing(page.request, w.base);
    const anna = await seedClient(page.request, w.base, 'Anna de Vries');
    await seedPrivate(page.request, w.base, {
      clientId: anna.id,
      trainerId: w.trainer('Mike'),
      localDate: thursday(),
      localStart: '19:30',
    });
    await page.goto(`/w/${w.slug}/classes/${boxing.classId}/${boxing.sessionId}`);
    await page.getByRole('button', { name: text.titleAssign }).click();
    const dialog = page.getByRole('dialog', { name: text.titleAssign });
    await dialog.getByRole('radio', { name: /Mike/ }).check();
    await dialog.getByRole('button', { name: text.t('submitAssign') }).click();

    const warning = page.getByRole('alertdialog');
    await expect(
      warning.getByRole('heading', {
        name: copy.sessions.doubleBooking.title.replace('{trainer}', 'Mike'),
      }),
    ).toBeVisible();
    await expectNoAxeViolations(page, `PS-07 on the trainer dialog in ${appLocale}`);
    await warning.getByRole('button', { name: copy.sessions.doubleBooking.back }).click();
    await expect(warning).toHaveCount(0);
    await expect(dialog).toBeVisible();
    expect((await storedSession(page.request, w.base, boxing.sessionId)).trainer).toBeUndefined();

    await dialog.getByRole('button', { name: text.t('submitAssign') }).click();
    await warning.getByRole('button', { name: copy.sessions.doubleBooking.saveAnyway }).click();
    await expect
      .poll(async () => (await storedSession(page.request, w.base, boxing.sessionId)).trainer?.name)
      .toBe('Mike');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('AC8: Trainer wijzigen on Mark’s session to Tom: the notify box names the address and language, and the e-mail goes only when checked', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const mark = await seedClient(page.request, w.base, 'Mark Jansen', 'en');
    const session = await seedPrivate(page.request, w.base, {
      clientId: mark.id,
      trainerId: w.trainer('Sarah'),
      localDate: thursday(),
      localStart: '09:00',
    });
    await page.goto(`/w/${w.slug}/sessions/${session.id}`);

    await page.getByRole('button', { name: text.titleChange }).click();
    const dialog = page.getByRole('dialog', { name: text.titleChange });
    await expect(dialog.getByText(text.t('currently', { name: 'Sarah' }))).toBeVisible();
    const notify = dialog.getByRole('checkbox', {
      name: text.t('notifyClient', { client: 'Mark Jansen' }),
    });
    await expect(notify).toBeChecked();
    await expect(
      dialog.getByText(
        text.t('notifyClientNote', { email: mark.email, language: copy.sessions.form.languageEn }),
      ),
    ).toBeVisible();
    await expectNoAxeViolations(page, `Trainer wijzigen in ${appLocale}`);
    await dialog.getByLabel(text.word.Word).selectOption({ label: 'Tom' });
    const assigned = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith(`/sessions/${session.id}/trainer`),
    );
    await dialog.getByRole('button', { name: text.t('submitChange') }).click();

    expect(((await (await assigned).json()) as { clientsNotified: number }).clientsNotified).toBe(
      1,
    );
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: text.t('donePrivate', { ...text.word, trainer: 'Tom' }) }),
    ).toBeVisible();
    await expect(page.getByRole('main').getByText('Tom', { exact: true })).toBeVisible();
    expect((await storedSession(page.request, w.base, session.id)).trainer?.name).toBe('Tom');
    // Mark is told in English, with the new trainer.
    const email = await trainerChangeEmail(mark.email, 'Tom');
    expect(email.subject).toContain(
      catalogs.en.email.trainerChange.privateSubject
        .split('{date}')[0]
        ?.replace('{word}', 'trainer') ?? '',
    );

    // With the box unchecked nothing is sent, and the session still changes hands.
    const anna = await seedClient(page.request, w.base, 'Anna de Vries');
    const second = await seedPrivate(page.request, w.base, {
      clientId: anna.id,
      trainerId: w.trainer('Sarah'),
      localDate: thursday(),
      localStart: '12:00',
    });
    await page.goto(`/w/${w.slug}/sessions/${second.id}`);
    await page.getByRole('button', { name: text.titleChange }).click();
    await page
      .getByRole('dialog', { name: text.titleChange })
      .getByLabel(text.word.Word)
      .selectOption({ label: 'Mike' });
    await page
      .getByRole('checkbox', { name: text.t('notifyClient', { client: 'Anna de Vries' }) })
      .uncheck();
    const silent = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith(`/sessions/${second.id}/trainer`),
    );
    await page.getByRole('button', { name: text.t('submitChange') }).click();
    expect(((await (await silent).json()) as { clientsNotified: number }).clientsNotified).toBe(0);
    expect((await storedSession(page.request, w.base, second.id)).trainer?.name).toBe('Mike');
  });

  test('AC12: Sarah (Trainer) sees no assignment actions, and the routes answer 403: she cannot assign herself to Boxing', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const boxing = await seedBoxing(page.request, w.base);
    const anna = await seedClient(page.request, w.base, 'Anna de Vries');
    const hers = await seedPrivate(page.request, w.base, {
      clientId: anna.id,
      trainerId: w.trainer('Sarah'),
      localDate: thursday(),
      localStart: '09:00',
    });
    await context.clearCookies();
    await signInWithSession(context, w.sarah);

    await page.goto(`/w/${w.slug}/classes/${boxing.classId}/${boxing.sessionId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Boxing' })).toBeVisible();
    await expect(page.getByRole('button', { name: text.titleAssign })).toHaveCount(0);
    await expect(page.getByRole('button', { name: text.titleSubstitute })).toHaveCount(0);
    await page.goto(`/w/${w.slug}/sessions/${hers.id}?assign=1`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: text.titleChange })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expectNoAxeViolations(
      page,
      `a Trainer’s session without Trainer wijzigen in ${appLocale}`,
    );

    const refused = await page.request.post(`${w.base}/sessions/${boxing.sessionId}/trainer`, {
      data: { trainerId: w.trainer('Sarah'), version: 1 },
    });
    expect(refused.status()).toBe(403);
    const candidates = await page.request.get(
      `${w.base}/sessions/${boxing.sessionId}/trainer-candidates`,
    );
    expect(candidates.status()).toBe(403);
  });

  test('AC13: Tom saves a session John gave to Sarah meanwhile and hears he no longer has permission; John’s stale dialog shows who changed it', async ({
    page,
    context,
    browser,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const mark = await seedClient(page.request, w.base, 'Mark Jansen');
    const session = await seedPrivate(page.request, w.base, {
      clientId: mark.id,
      trainerId: w.trainer('Tom'),
      localDate: thursday(),
      localStart: '09:00',
    });
    const toms = await browser.newContext({ extraHTTPHeaders: clientIpHeaders() });
    await signInWithSession(toms, w.tom);
    const tab = await toms.newPage();
    await tab.goto(`/w/${w.slug}/sessions/${session.id}`);
    await tab.getByRole('button', { name: copy.sessions.page.reschedule }).click();
    const form = tab.getByRole('dialog', { name: copy.sessions.reschedule.title });
    await form.getByLabel(copy.sessions.reschedule.dateLabel).fill(shift(thursday(), 1));

    // Meanwhile John changes the trainer to Sarah.
    const changed = await page.request.post(`${w.base}/sessions/${session.id}/trainer`, {
      data: { trainerId: w.trainer('Sarah'), version: 1, notifyClients: false },
    });
    expect(changed.status()).toBe(200);
    await form.getByRole('button', { name: copy.sessions.reschedule.submitNotify }).click();

    await expect(form.getByText(copy.sessions.reschedule.noPermission)).toBeVisible();
    await expectNoAxeViolations(tab, `PS-05 without permission in ${appLocale}`);
    await toms.close();

    // John opens Trainer wijzigen on Boxing, and someone else gives it a trainer before he saves.
    const boxing = await seedBoxing(page.request, w.base);
    await page.goto(`/w/${w.slug}/classes/${boxing.classId}/${boxing.sessionId}`);
    await page.getByRole('button', { name: text.titleAssign }).click();
    const dialog = page.getByRole('dialog', { name: text.titleAssign });
    await dialog.getByRole('radio', { name: 'Tom' }).check();
    const other = await browser.newContext({ extraHTTPHeaders: clientIpHeaders() });
    await signInWithSession(other, w.john);
    const meanwhile = await other.request.post(`${w.base}/sessions/${boxing.sessionId}/trainer`, {
      data: { trainerId: w.trainer('Sarah'), version: 1, notifyClients: false },
    });
    expect(meanwhile.status()).toBe(200);
    await other.close();
    await dialog.getByRole('button', { name: text.t('submitAssign') }).click();

    await expect(dialog.getByText(text.t('errors.changedBy', { name: 'John' }))).toBeVisible();
    // The dialog now holds the session as it is: Sarah teaches it, so there is nobody to choose for this one-off date.
    await expect(dialog.getByRole('radio')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: text.t('submitAssign') })).toHaveCount(0);
    expect((await storedSession(page.request, w.base, boxing.sessionId)).trainer?.name).toBe(
      'Sarah',
    );
  });

  test('AC17: CO-02 counts the participants to notify, once each, and unchecked nothing is sent', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await team(page, context);
    const text = wording(appLocale, copy);
    const kracht = await seedKracht(page.request, w.base, w.trainer('Sarah'));
    const [, second, third] = kracht.dates;
    if (!second || !third) throw new Error('Kracht has fewer than three dates.');
    const anna = await seedClient(page.request, w.base, 'Anna de Vries');
    const mark = await seedClient(page.request, w.base, 'Mark Jansen', 'en');
    // Anna on both dates, Mark on the later one only (inserted until booking exists, M5).
    await bookParticipant(second, anna.id);
    await bookParticipant(third, anna.id);
    await bookParticipant(third, mark.id);
    await page.goto(`/w/${w.slug}/classes/${kracht.classId}/${second}`);

    await page.getByRole('button', { name: text.titleSubstitute }).click();
    const dialog = page.getByRole('dialog', { name: text.titleSubstitute });
    await dialog.getByRole('radio', { name: 'Mike' }).check();
    const notify = dialog.getByRole('checkbox', { name: text.t('notifyClass', { count: 2 }) });
    await expect(notify).toBeChecked();
    await expectNoAxeViolations(page, `CO-02 with participants in ${appLocale}`);
    const assigned = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith(`/sessions/${second}/trainer`),
    );
    await dialog.getByRole('button', { name: text.t('submitSubstitute') }).click();
    expect(((await (await assigned).json()) as { clientsNotified: number }).clientsNotified).toBe(
      2,
    );
    // Anna gets one email for both dates, Mark one for his; neither names the other.
    const forAnna = await trainerChangeEmail(anna.email, 'Mike');
    const forMark = await trainerChangeEmail(mark.email, 'Mike');
    expect(forAnna.text).not.toContain('Mark');
    expect(forMark.text).not.toContain('Anna');

    // Unchecked, the same change to Tom tells nobody (once the page shows Mike).
    await expect(page.getByRole('main').getByText('Mike', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: text.titleSubstitute }).click();
    const again = page.getByRole('dialog', { name: text.titleSubstitute });
    await again.getByRole('radio', { name: 'Tom' }).check();
    await again.getByRole('checkbox', { name: text.t('notifyClass', { count: 2 }) }).uncheck();
    const silent = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith(`/sessions/${second}/trainer`),
    );
    await again.getByRole('button', { name: text.t('submitSubstitute') }).click();
    expect(((await (await silent).json()) as { clientsNotified: number }).clientsNotified).toBe(0);
  });

  test('a class date without bookings has no notify box, and a team of one has nobody to choose and leads to Trainers', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const john = newAddress('john');
    await createAccount(john, undefined, 'John');
    const slug = await createGymWithTrainer(john, GYM, 'owner', false);
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaces = (await (await page.request.get('/api/v1/me/workspaces')).json()) as {
      workspaceId: string;
      name: string;
    }[];
    const base = `/api/v1/workspaces/${workspaces.find((workspace) => workspace.name === GYM)?.workspaceId}`;
    const text = wording(appLocale, copy);
    const boxing = await seedBoxing(page.request, base);
    await page.goto(`/w/${slug}/classes/${boxing.classId}/${boxing.sessionId}`);

    await page.getByRole('button', { name: text.titleAssign }).click();
    const dialog = page.getByRole('dialog', { name: text.titleAssign });
    await expect(
      dialog.getByText(text.t('noOthers', { ...text.word, workspace: GYM })),
    ).toBeVisible();
    await expect(dialog.getByRole('checkbox')).toHaveCount(0);
    await expectNoAxeViolations(page, `CO-02 without other trainers in ${appLocale}`);
    await dialog.getByRole('link', { name: text.t('inviteTrainer', { ...text.word }) }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${slug}/trainers$`));
  });
});
