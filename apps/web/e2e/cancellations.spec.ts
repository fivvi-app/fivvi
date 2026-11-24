import { formattingLocales, type Locale, type Messages } from '@fivvi/i18n';
import type { Page } from '@playwright/test';
import { createTranslator } from 'next-intl';
import { bookParticipant, clientIpHeaders, passSession, signInWithSession } from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';
import { emailsTo, waitForEmails } from './lettermint';
import {
  seedClient,
  seedKracht,
  seedPrivate,
  shift,
  storedSession,
  team,
  thursday,
  tuesday,
  type World,
  wording,
} from './trainer-assignment-world';

// F026 (spec #462): PS-06 *Sessie annuleren?* on the session page (ticket #559), CO-03 *Les
// annuleren?* on CO-01 and the stopped series on Classes (ticket #560), and cancelling from the
// calendar's quick view with the cancelled items on every calendar (ticket #561). John owns John's
// Gym; Sarah and Tom are its Trainers. Anna de Vries is a client. Copy comes from the catalogs.

interface CancelledSession {
  id: string;
  version: number;
  status: string;
  startsAt: string;
  participants: { attendanceStatus: string }[];
  cancellation?: {
    cancelledAt: string;
    cancelledBy?: { name: string };
    initiator: 'client' | 'workspace';
  };
}

/** The translators of the catalog namespaces these specs read, with the formatting of the project's locale. */
const cancelText = (locale: Locale, messages: Messages) =>
  createTranslator({ locale: formattingLocales[locale], messages, namespace: 'sessions.cancel' });
const classText = (locale: Locale, messages: Messages) =>
  createTranslator({ locale: formattingLocales[locale], messages, namespace: 'classes.cancel' });
const pageText = (locale: Locale, messages: Messages) =>
  createTranslator({ locale: formattingLocales[locale], messages, namespace: 'sessions.page' });

/** `do 24 sep`: a day as the session screens write it, in the workspace's zone. */
const shortDay = (locale: Locale, instant: string) =>
  new Intl.DateTimeFormat(formattingLocales[locale], {
    timeZone: 'Europe/Amsterdam',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(instant));

const clock = (locale: Locale, instant: string) =>
  new Intl.DateTimeFormat(formattingLocales[locale], {
    timeZone: 'Europe/Amsterdam',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));

const stored = (page: Page, w: World, id: string) =>
  storedSession(page.request, w.base, id) as Promise<CancelledSession>;

test.describe('F026 PS-06 Sessie annuleren? on the session page', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  /** John's Gym with Anna and one session of Sarah's and one of Tom's, John signed in. */
  async function world(page: Page, context: Parameters<typeof team>[1]) {
    const w = await team(page, context);
    const anna = await seedClient(page.request, w.base, 'Anna de Vries', 'nl-NL');
    const sarahs = await seedPrivate(page.request, w.base, {
      clientId: anna.id,
      trainerId: w.trainer('Sarah'),
      localDate: thursday(),
      localStart: '09:00',
    });
    const toms = await seedPrivate(page.request, w.base, {
      clientId: anna.id,
      trainerId: w.trainer('Tom'),
      localDate: thursday(),
      localStart: '11:00',
    });
    return { w, anna, sarahs, toms };
  }

  test('AC1: cancel a private session: Sarah keeps De klant, the box is off, and the session is recorded as cancelled', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const { w, anna, sarahs } = await world(page, context);
    const t = cancelText(appLocale, copy);
    await signInWithSession(context, w.sarah);
    await page.goto(`/w/${w.slug}/sessions/${sarahs.id}`);

    await page.getByRole('button', { name: t('action'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t('title') });
    await expect(dialog.getByRole('radio', { name: t('whoClient') })).toBeChecked();
    await expect(dialog.getByText(t('nudgeQuestion'))).toBeVisible();
    await dialog.getByRole('button', { name: t('nudgeCancelAnyway') }).click();
    await expect(
      dialog.getByRole('checkbox', { name: t('notify', { client: anna.name }) }),
    ).not.toBeChecked();
    await expectNoAxeViolations(page, `PS-06 in ${appLocale}`);
    await dialog.getByRole('button', { name: t('submit') }).click();

    await expect(page.getByRole('status').filter({ hasText: t('done') })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const after = await stored(page, w, sarahs.id);
    expect(after.status).toBe('cancelled');
    expect(after.participants.map((participant) => participant.attendanceStatus)).toEqual([
      'cancelled',
    ]);
    expect(after.cancellation?.initiator).toBe('client');
    expect(after.cancellation?.cancelledBy?.name).toBe('Sarah');
    expect(await emailsTo(anna.email)).toHaveLength(0);
  });

  test('AC1a: the client-cancel dialog offers Reschedule first; Verplaatsen opens PS-05 and cancels nothing; Wij skips the question', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const { w, sarahs } = await world(page, context);
    const t = cancelText(appLocale, copy);
    await signInWithSession(context, w.sarah);
    await page.goto(`/w/${w.slug}/sessions/${sarahs.id}`);

    await page.getByRole('button', { name: t('action'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t('title') });
    await expect(dialog.getByText(t('nudgeQuestion'))).toBeVisible();
    await expect(dialog.getByRole('button', { name: t('submit') })).toHaveCount(0);
    await dialog.getByRole('button', { name: t('nudgeReschedule') }).click();

    await expect(page.getByRole('dialog', { name: copy.sessions.reschedule.title })).toBeVisible();
    expect((await stored(page, w, sarahs.id)).status).toBe('scheduled');
    await page
      .getByRole('dialog', { name: copy.sessions.reschedule.title })
      .getByRole('button', { name: copy.sessions.reschedule.cancel })
      .click();

    // Wij goes straight to the confirm step, with the box on.
    await page.getByRole('button', { name: t('action'), exact: true }).click();
    const again = page.getByRole('dialog', { name: t('title') });
    await again.getByRole('radio', { name: t('whoUs') }).check();
    await expect(again.getByText(t('nudgeQuestion'))).toHaveCount(0);
    await expect(again.getByRole('checkbox')).toBeChecked();
    await expect(again.getByRole('button', { name: t('submit') })).toBeVisible();
    await again.getByRole('button', { name: t('back') }).click();
    expect((await stored(page, w, sarahs.id)).status).toBe('scheduled');
  });

  test('AC2: John cancels Tom’s session with Wij and the email box on: the client is emailed', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const { w, anna, toms } = await world(page, context);
    const t = cancelText(appLocale, copy);
    await page.goto(`/w/${w.slug}/sessions/${toms.id}`);

    await page.getByRole('button', { name: t('action'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t('title') });
    await dialog.getByRole('radio', { name: t('whoUs') }).check();
    const box = dialog.getByRole('checkbox', { name: t('notify', { client: anna.name }) });
    await expect(box).toBeChecked();
    await expect(
      dialog.getByText(
        t('notifyNote', { email: anna.email, language: copy.sessions.form.languageNl }),
      ),
    ).toBeVisible();
    await expectNoAxeViolations(page, `PS-06 Wij in ${appLocale}`);
    await dialog.getByRole('button', { name: t('submit') }).click();

    await expect(page.getByRole('status').filter({ hasText: t('done') })).toBeVisible();
    const after = await stored(page, w, toms.id);
    expect(after.cancellation?.initiator).toBe('workspace');
    expect(after.cancellation?.cancelledBy?.name).toBe('John');
    expect(await waitForEmails(anna.email)).toHaveLength(1);
  });

  test('AC2: John cancels Tom’s session with Wij and unchecks the email box: nothing is sent to the client', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const { w, anna, toms } = await world(page, context);
    const t = cancelText(appLocale, copy);
    await page.goto(`/w/${w.slug}/sessions/${toms.id}`);

    await page.getByRole('button', { name: t('action'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t('title') });
    await dialog.getByRole('radio', { name: t('whoUs') }).check();
    const box = dialog.getByRole('checkbox', { name: t('notify', { client: anna.name }) });
    await expect(box).toBeChecked();
    await box.uncheck();
    const request = page.waitForRequest((sent) =>
      sent.url().endsWith(`/sessions/${toms.id}/cancel`),
    );
    await dialog.getByRole('button', { name: t('submit') }).click();

    expect((await request).postDataJSON()).toMatchObject({ initiator: 'workspace', notify: false });
    await expect(page.getByRole('status').filter({ hasText: t('done') })).toBeVisible();
    const after = await stored(page, w, toms.id);
    expect(after.status).toBe('cancelled');
    expect(after.cancellation?.initiator).toBe('workspace');
    expect(await emailsTo(anna.email)).toHaveLength(0);
  });

  test('AC3: the cancelled session page says who cancelled it and when, at the client’s request, and offers only Klantprofiel', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const { w, anna, sarahs } = await world(page, context);
    const sessions = pageText(appLocale, copy);
    const answer = await page.request.post(`${w.base}/sessions/${sarahs.id}/cancel`, {
      data: { initiator: 'client', notify: false, version: sarahs.version },
    });
    expect(answer.status()).toBe(200);
    const after = await stored(page, w, sarahs.id);
    const at = after.cancellation?.cancelledAt ?? '';
    await page.goto(`/w/${w.slug}/sessions/${sarahs.id}`);

    const banner = `${sessions('cancelledBanner', {
      date: shortDay(appLocale, at),
      time: clock(appLocale, at),
      name: 'John',
    })} · ${sessions('cancelledByClient')}`;
    await expect(page.getByRole('main').getByText(banner)).toBeVisible();
    const actions = page.getByRole('main').getByRole('button');
    await expect(actions).toHaveCount(0);
    await expect(
      page.getByRole('main').getByRole('link', { name: sessions('clientProfile') }),
    ).toHaveAttribute('href', `/w/${w.slug}/clients/${anna.id}`);
    await expectNoAxeViolations(page, `cancelled session page in ${appLocale}`);
  });

  test('AC5: Tom has no Annuleren on Sarah’s session, and has it on his own', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const { w, sarahs, toms } = await world(page, context);
    const t = cancelText(appLocale, copy);
    await signInWithSession(context, w.tom);

    await page.goto(`/w/${w.slug}/sessions/${toms.id}`);
    await expect(page.getByRole('button', { name: t('action'), exact: true })).toBeVisible();

    await page.goto(`/w/${w.slug}/sessions/${sarahs.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: t('action'), exact: true })).toHaveCount(0);
  });
});

test.describe('F026 CO-03 Les annuleren? on CO-01 and the stopped series', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  /** John's Gym with Kracht on Tuesdays with Sarah; Anna (Dutch), Mark (English) and Lisa are booked on its first date. */
  async function kracht(page: Page, context: Parameters<typeof team>[1]) {
    const w = await team(page, context);
    const anna = await seedClient(page.request, w.base, 'Anna de Vries', 'nl-NL');
    const mark = await seedClient(page.request, w.base, 'Mark Jansen', 'en');
    const lisa = await seedClient(page.request, w.base, 'Lisa Bakker', 'nl-NL');
    const series = await seedKracht(page.request, w.base, w.trainer('Sarah'));
    const [first = '', second = '', third = ''] = series.dates;
    for (const client of [anna, mark, lisa]) await bookParticipant(first, client.id);
    return { w, anna, mark, lisa, classId: series.classId, first, second, third };
  }

  test('AC6: John cancels only the first date with a message: the dialog counts three people, the date is cancelled and the other dates stay', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const { w, anna, mark, classId, first, second } = await kracht(page, context);
    const t = classText(appLocale, copy);
    const text = wording(appLocale, copy);
    await page.goto(`/w/${w.slug}/classes/${classId}/${first}`);

    await page.getByRole('button', { name: t('action'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t('title') });
    await expect(dialog.getByRole('radio', { name: t('scopeThis') })).toBeChecked();
    await expect(dialog.getByText(t('countThis', { participants: 3 }))).toBeVisible();
    await dialog.getByLabel(t('messageLabel')).fill('Sarah is ziek, sorry!');
    await expect(dialog.getByText(t('messageHint'))).toBeVisible();
    await expectNoAxeViolations(page, `CO-03 in ${appLocale}`);
    await dialog.getByRole('button', { name: t('submit') }).click();

    const date = (await storedSession(page.request, w.base, first)).startsAt;
    await expect(
      page.getByRole('status').filter({
        hasText: t('done', { class: text.kracht, date: text.day(date) }),
      }),
    ).toBeVisible();
    const after = await stored(page, w, first);
    expect(after.status).toBe('cancelled');
    expect(after.participants.map((participant) => participant.attendanceStatus)).toEqual([
      'cancelled',
      'cancelled',
      'cancelled',
    ]);
    expect((await stored(page, w, second)).status).toBe('scheduled');
    // Each participant's email says what John typed.
    for (const client of [anna, mark]) {
      const [email] = await waitForEmails(client.email);
      expect(email?.text).toContain('Sarah is ziek, sorry!');
    }
    // CO-01 now shows the banner and the cancelled participants.
    await expect(
      page.getByRole('heading', { name: copy.classes.date.cancelledSection, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: t('action'), exact: true })).toHaveCount(0);
  });

  test('AC7: John cancels the second date and all following: the series stops and Classes says Gestopt vanaf', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const { w, classId, first, second, third } = await kracht(page, context);
    const t = classText(appLocale, copy);
    const text = wording(appLocale, copy);
    await page.goto(`/w/${w.slug}/classes/${classId}/${second}`);

    await page.getByRole('button', { name: t('action'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t('title') });
    await dialog.getByRole('radio', { name: t('scopeFollowing') }).check();
    await expect(dialog.getByText(t('countNone'))).toBeVisible();
    await dialog.getByRole('button', { name: t('submit') }).click();
    await expect(page.getByRole('status').filter({ hasText: text.kracht })).toBeVisible();

    expect((await stored(page, w, first)).status).toBe('scheduled');
    expect((await stored(page, w, second)).status).toBe('cancelled');
    // The dates after it had no participants and no changes of their own: they are removed, not cancelled.
    expect((await page.request.get(`${w.base}/sessions/${third}`)).status()).toBe(404);
    await page.goto(`/w/${w.slug}/classes/${classId}`);
    await expect(
      page.getByText(
        copy.classes.series.stopped.replace('{date}', text.longDate(shift(tuesday(), 7))),
      ),
    ).toBeVisible();
  });

  test('AC8: a date without participants says nobody gets an email, and cancelling sends nothing', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const { w, classId, second } = await kracht(page, context);
    const t = classText(appLocale, copy);
    await page.goto(`/w/${w.slug}/classes/${classId}/${second}`);

    await page.getByRole('button', { name: t('action'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t('title') });
    await expect(dialog.getByText(t('countNone'))).toBeVisible();
    await dialog.getByRole('button', { name: t('submit') }).click();

    await expect(
      page.getByText(copy.classes.date.cancelledBanner.split('{')[0] ?? ''),
    ).toBeVisible();
    expect((await stored(page, w, second)).status).toBe('cancelled');
  });

  test('AC9: a date that has passed is recorded for the record: no message field, no emails', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const { w, anna, classId, first } = await kracht(page, context);
    const t = classText(appLocale, copy);
    await passSession(first);
    await page.goto(`/w/${w.slug}/classes/${classId}/${first}`);

    await page.getByRole('button', { name: t('action'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t('title') });
    await expect(dialog.getByText(t('started'))).toBeVisible();
    await expect(dialog.getByLabel(t('messageLabel'))).toHaveCount(0);
    await dialog.getByRole('button', { name: t('submit') }).click();

    await expect(
      page.getByRole('heading', { name: copy.classes.date.cancelledSection, exact: true }),
    ).toBeVisible();
    expect((await stored(page, w, first)).status).toBe('cancelled');
    expect(await emailsTo(anna.email)).toHaveLength(0);
  });

  test('AC5: Tom has no Les annuleren on CO-01', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const { w, classId, first } = await kracht(page, context);
    const t = classText(appLocale, copy);
    await signInWithSession(context, w.tom);
    await page.goto(`/w/${w.slug}/classes/${classId}/${first}`);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: t('action'), exact: true })).toHaveCount(0);
  });
});

/** Today in Dutch time, `YYYY-MM-DD`: the day *Mijn dag* shows. */
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date());

test.describe('F026 cancelling from the calendar and the cancelled items on every calendar', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  /** The blocks of the workspace calendar: each opens the quick view. */
  const blocks = (page: Page) => page.getByRole('main').locator('button[aria-haspopup="dialog"]');

  test('AC3: the cancelled session stays on Mijn dag, Mijn agenda and John’s Gym’s calendar, struck through with Geannuleerd', async ({
    page,
    context,
    messages: copy,
  }) => {
    test.slow();
    const w = await team(page, context);
    const anna = await seedClient(page.request, w.base, 'Anna de Vries', 'nl-NL');
    const session = await seedPrivate(page.request, w.base, {
      clientId: anna.id,
      trainerId: w.trainer('Sarah'),
      localDate: today(),
      localStart: '09:00',
    });
    const answer = await page.request.post(`${w.base}/sessions/${session.id}/cancel`, {
      data: { initiator: 'client', notify: false, version: session.version },
    });
    expect(answer.status()).toBe(200);

    // The workspace calendar (John).
    await page.goto(`/w/${w.slug}/calendar?date=${today()}&view=week`);
    const cancelled = blocks(page).filter({ hasText: copy.myCalendar.cancelled });
    await expect(cancelled).toHaveCount(1);
    await expect(cancelled.getByText(`${copy.myCalendar.typePrivate} · Anna de Vries`)).toHaveCSS(
      'text-decoration-line',
      'line-through',
    );

    // Mijn dag and Mijn agenda (Sarah, the session's trainer).
    await signInWithSession(context, w.sarah);
    await page.goto('/me/day');
    const row = page.getByRole('link', { name: new RegExp(copy.myDay.cancelled) });
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('href', `/w/${w.slug}/sessions/${session.id}`);
    await expect(row.getByText('Anna de Vries')).toHaveCSS('text-decoration-line', 'line-through');
    await page.goto('/me/calendar');
    const block = page.locator(`a[href$="/sessions/${session.id}"]`);
    await expect(block).toContainText(copy.myCalendar.cancelled);
    await expect(block.getByText(`${copy.myCalendar.typePrivate} · Anna de Vries`)).toHaveCSS(
      'text-decoration-line',
      'line-through',
    );
  });

  test('AC5: the quick view offers Annuleren and Les annuleren to John, Annuleren on their own session to Sarah and neither to Tom on a colleague’s', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const w = await team(page, context);
    const cancel = cancelText(appLocale, copy);
    const classes = classText(appLocale, copy);
    const anna = await seedClient(page.request, w.base, 'Anna de Vries', 'nl-NL');
    const mark = await seedClient(page.request, w.base, 'Mark Jansen', 'en');
    const sarahs = await seedPrivate(page.request, w.base, {
      clientId: anna.id,
      trainerId: w.trainer('Sarah'),
      localDate: tuesday(),
      localStart: '07:00',
    });
    await seedPrivate(page.request, w.base, {
      clientId: mark.id,
      trainerId: w.trainer('Tom'),
      localDate: tuesday(),
      localStart: '08:30',
    });
    const series = await seedKracht(page.request, w.base, w.trainer('Sarah'));
    const calendar = `/w/${w.slug}/calendar?date=${tuesday()}&view=week`;
    const quickView = page.getByRole('dialog');

    // John: both, and Annuleren opens PS-06 on the session page.
    await page.goto(calendar);
    await blocks(page).filter({ hasText: 'Mark Jansen' }).click();
    await expect(
      quickView.getByRole('link', { name: cancel('action'), exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await blocks(page).filter({ hasText: 'Anna de Vries' }).click();
    await quickView.getByRole('link', { name: cancel('action'), exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${sarahs.id}\\?cancel=1$`));
    await expect(page.getByRole('dialog', { name: cancel('title') })).toBeVisible();
    await expectNoAxeViolations(page, `PS-06 from the quick view in ${appLocale}`);

    // Les annuleren opens CO-03 on CO-01.
    await page.goto(calendar);
    await blocks(page).filter({ hasText: copy.myCalendar.typeGroup }).first().click();
    await quickView.getByRole('link', { name: classes('action'), exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/classes/${series.classId}/${series.dates[0]}\\?cancel=1$`),
    );
    await expect(page.getByRole('dialog', { name: classes('title') })).toBeVisible();

    // Sarah: Annuleren on her own session, nothing on Tom's, no Les annuleren.
    await signInWithSession(context, w.sarah);
    await page.goto(calendar);
    await blocks(page).filter({ hasText: 'Anna de Vries' }).click();
    await expect(
      quickView.getByRole('link', { name: cancel('action'), exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await blocks(page).filter({ hasText: 'Mark Jansen' }).click();
    await expect(quickView.getByRole('link', { name: cancel('action'), exact: true })).toHaveCount(
      0,
    );
    await page.keyboard.press('Escape');
    await blocks(page).filter({ hasText: copy.myCalendar.typeGroup }).first().click();
    await expect(quickView.getByRole('link', { name: classes('action'), exact: true })).toHaveCount(
      0,
    );

    // Tom: Annuleren on his own session only.
    await signInWithSession(context, w.tom);
    await page.goto(calendar);
    await blocks(page).filter({ hasText: 'Anna de Vries' }).click();
    await expect(quickView.getByRole('link', { name: cancel('action'), exact: true })).toHaveCount(
      0,
    );
    await page.keyboard.press('Escape');
    await blocks(page).filter({ hasText: 'Mark Jansen' }).click();
    await expect(
      quickView.getByRole('link', { name: cancel('action'), exact: true }),
    ).toBeVisible();
  });
});
