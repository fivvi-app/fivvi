import { formattingLocales, type Locale, type Messages } from '@fivvi/i18n';
import type { Page } from '@playwright/test';
import { createTranslator } from 'next-intl';
import {
  bookParticipant,
  cancelSession,
  clientIpHeaders,
  moveSessionTo,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';
import {
  inDays,
  seedClassDate,
  seedClient,
  seedKrachtClass,
  seedPrivate,
  storedSession,
  team,
  type World,
} from './trainer-assignment-world';

// F025 (spec #460, tickets #546 and #547): attendance on the web. The session page and CO-06 on
// CO-01 (#546), the status in WC-05 and WC-04, *Aandacht nodig* on the dashboard and the nudge on
// *Mijn dag* (#547). John owns John's Gym; Sarah and Tom are its Trainers; Anna de Vries, Bram
// Jansen and Chris Bakker are clients. Sessions are planned through the API and then set to run now,
// to have ended today or to have ended yesterday: the API plans nothing in the past. Copy comes
// from the catalogs.
const MINUTE = 60 * 1000;
const PHONE = { width: 390, height: 844 };

const text = (locale: Locale, copy: Messages) =>
  createTranslator({ locale: formattingLocales[locale], messages: copy, namespace: 'attendance' });

/** Today in Dutch time, `YYYY-MM-DD`. */
const amsterdamDay = (instant: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(instant);

/** A session that began 30 minutes ago and ends in 30: attendance is open and it is not over. */
const running = () =>
  [new Date(Date.now() - 30 * MINUTE), new Date(Date.now() + 30 * MINUTE)] as const;

interface Participants {
  status: string;
  summary: { attended: number; noShow: number; open: number };
  participants: { name: string; status: string }[];
}

async function participantsOf(page: Page, w: World, sessionId: string) {
  const response = await page.request.get(`${w.base}/sessions/${sessionId}/participants`);
  expect(response.status()).toBe(200);
  return (await response.json()) as Participants;
}

test.describe('F025 attendance on the web', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  /** John's Gym with Anna's private session with Sarah, running now; John signed in. */
  async function privateSession(page: Page, context: Parameters<typeof team>[1]) {
    const w = await team(page, context);
    const anna = await seedClient(page.request, w.base, 'Anna de Vries');
    const session = await seedPrivate(page.request, w.base, {
      clientId: anna.id,
      trainerId: w.trainer('Sarah'),
      localDate: inDays(4),
      localStart: '09:00',
    });
    await moveSessionTo(session.id, ...running());
    return { w, anna, session };
  }

  /** Kracht with Anna, Bram and Chris booked, John signed in. `start` sets when the date takes place. */
  async function classDate(
    page: Page,
    context: Parameters<typeof team>[1],
    start?: readonly [Date, Date],
  ) {
    const w = await team(page, context);
    const classId = await seedKrachtClass(page.request, w.base, w.trainer('Sarah'));
    const sessionId = await seedClassDate(
      page.request,
      w.base,
      classId,
      inDays(4),
      w.trainer('Sarah'),
    );
    const clients = [];
    for (const name of ['Anna de Vries', 'Bram Jansen', 'Chris Bakker']) {
      const client = await seedClient(page.request, w.base, name);
      await bookParticipant(sessionId, client.id);
      clients.push(client);
    }
    if (start) await moveSessionTo(sessionId, ...start);
    return { w, classId, sessionId, clients, url: `/w/${w.slug}/classes/${classId}/${sessionId}` };
  }

  const group = (page: Page, copy: Messages, locale: Locale, name: string) =>
    page.getByRole('group', { name: text(locale, copy)('groupLabel', { name }) });

  test('AC3: on the session page John sets Anna with the keyboard and a click, it saves at once, and WC-05 and WC-04 show it', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const t = text(appLocale, copy);
    const { w, session } = await privateSession(page, context);
    await page.goto(`/w/${w.slug}/sessions/${session.id}`);
    const anna = group(page, copy, appLocale, 'Anna de Vries');

    // Geboekt is where it starts; the arrow key moves to Aanwezig and saves.
    await expect(anna.getByRole('radio', { name: t('status.booked') })).toBeChecked();
    await anna.getByRole('radio', { name: t('status.booked') }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(anna.getByRole('radio', { name: t('status.attended') })).toBeChecked();
    await expect(page.getByRole('status').filter({ hasText: t('saved') })).toBeVisible();
    expect((await participantsOf(page, w, session.id)).participants[0]?.status).toBe('attended');
    await expectNoAxeViolations(page, `the session page with attendance in ${appLocale}`);

    // A click on Niet verschenen, then back to Geboekt with the keyboard: a tap is taken back.
    await anna.getByText(t('status.noShow'), { exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: t('saved') })).toBeVisible();
    expect((await participantsOf(page, w, session.id)).participants[0]?.status).toBe('no_show');
    await anna.getByText(t('status.attended'), { exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: t('saved') })).toBeVisible();

    // WC-05 (the quick view) and WC-04 (the list) then say "Aanwezigheid: Aanwezig".
    const line = t('line', { status: t('status.attended') });
    const day = amsterdamDay(new Date());
    await page.goto(`/w/${w.slug}/calendar?view=list&date=${day}`);
    await expect(page.getByRole('table').getByText(line)).toBeVisible();
    await page.getByRole('button', { name: 'Anna de Vries' }).click();
    await expect(page.getByRole('dialog').getByText(line)).toBeVisible();
  });

  test('AC3: the same group works at a phone width, and a person who may not take attendance has it read-only', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const t = text(appLocale, copy);
    const { w, session } = await privateSession(page, context);
    await page.setViewportSize(PHONE);
    await page.goto(`/w/${w.slug}/sessions/${session.id}`);
    const anna = group(page, copy, appLocale, 'Anna de Vries');

    await anna.getByText(t('status.attended'), { exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: t('saved') })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expectNoAxeViolations(page, `the attendance of a session at 390 px in ${appLocale}`);

    // Tom is another Trainer: he reads it and cannot take it.
    await signInWithSession(context, w.tom);
    await page.goto(`/w/${w.slug}/sessions/${session.id}`);
    await expect(anna.getByRole('radio', { name: t('status.attended') })).toBeChecked();
    await expect(anna.getByRole('radio', { name: t('status.noShow') })).toBeDisabled();
  });

  test('AC4, Iedereen aanwezig: John sees the statuses on CO-01; one click marks every open participant, Anna stays Niet verschenen', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const t = text(appLocale, copy);
    const { w, sessionId, url } = await classDate(page, context, running());
    await page.goto(url);
    const summary = (attended: number, noShow: number, open: number) =>
      t('summary', { attended, noShow, open });

    await expect(page.getByText(summary(0, 0, 3))).toBeVisible();
    await group(page, copy, appLocale, 'Anna de Vries')
      .getByText(t('status.noShow'), { exact: true })
      .click();
    await expect(page.getByText(summary(0, 1, 2))).toBeVisible();
    await expectNoAxeViolations(page, `CO-06 on CO-01 in ${appLocale}`);

    await page.getByRole('button', { name: t('everyone') }).click();
    await expect(page.getByText(summary(2, 1, 0))).toBeVisible();
    for (const [name, status] of [
      ['Anna de Vries', 'noShow'],
      ['Bram Jansen', 'attended'],
      ['Chris Bakker', 'attended'],
    ] as const) {
      await expect(
        group(page, copy, appLocale, name).getByRole('radio', { name: t(`status.${status}`) }),
      ).toBeChecked();
    }
    // What the page says is what the API holds (AC4): after a reload the same.
    await page.reload();
    await expect(page.getByText(summary(2, 1, 0))).toBeVisible();
    expect(
      (await participantsOf(page, w, sessionId)).participants.map((one) => one.status),
    ).toEqual(['no_show', 'attended', 'attended']);

    // At a phone width the rows wrap and nothing runs off the screen.
    await page.setViewportSize(PHONE);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expectNoAxeViolations(page, `CO-06 at 390 px in ${appLocale}`);
  });

  test('AC5: before attendance opens CO-06 says from when, with nothing to tap', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const t = text(appLocale, copy);
    const { w, url } = await classDate(page, context);
    await page.goto(url);

    // The date is Kracht at 18:00 in four days: from 17:30.
    await expect(page.getByText(t('tooEarly', { time: '17:30' }))).toBeVisible();
    for (const status of ['booked', 'attended', 'noShow'] as const) {
      await expect(
        group(page, copy, appLocale, 'Anna de Vries').getByRole('radio', {
          name: t(`status.${status}`),
        }),
      ).toBeDisabled();
    }
    await expect(page.getByRole('button', { name: t('everyone') })).toHaveCount(0);
    await expectNoAxeViolations(page, `CO-06 too early in ${appLocale}`);
    expect(w.slug).toBeTruthy();
  });

  test('AC6: a cancelled class and a cancelled private session say no attendance is needed, without buttons', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const t = text(appLocale, copy);
    const { url, sessionId } = await classDate(page, context, running());
    await cancelSession(sessionId);
    await page.goto(url);

    await expect(page.getByText(t('cancelledClass'))).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expect(page.getByRole('button', { name: t('everyone') })).toHaveCount(0);
    await expectNoAxeViolations(page, `CO-06 cancelled in ${appLocale}`);
  });

  test('AC6: a cancelled private session', async ({ page, context, appLocale, messages: copy }) => {
    test.slow();
    const t = text(appLocale, copy);
    const { w, session } = await privateSession(page, context);
    await cancelSession(session.id);
    await page.goto(`/w/${w.slug}/sessions/${session.id}`);

    await expect(page.getByText(t('cancelledSession'))).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(0);
  });

  test('#547 AC11: two sessions of yesterday without attendance: the dashboard lists both with links, and the row is gone once both are filled in', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const t = text(appLocale, copy);
    const { w, session } = await privateSession(page, context);
    const yesterday = amsterdamDay(new Date(Date.now() - 24 * 60 * MINUTE));
    await moveSessionTo(
      session.id,
      new Date(`${yesterday}T08:00:00Z`),
      new Date(`${yesterday}T09:00:00Z`),
    );
    const classId = await seedKrachtClass(page.request, w.base, w.trainer('Sarah'));
    const kracht = await seedClassDate(
      page.request,
      w.base,
      classId,
      inDays(5),
      w.trainer('Sarah'),
    );
    for (const name of ['Bram Jansen', 'Chris Bakker']) {
      await bookParticipant(kracht, (await seedClient(page.request, w.base, name)).id);
    }
    await moveSessionTo(
      kracht,
      new Date(`${yesterday}T10:00:00Z`),
      new Date(`${yesterday}T11:00:00Z`),
    );

    await page.goto(`/w/${w.slug}`);
    const attention = page.getByRole('main');
    await expect(attention.getByText(t('needs', { count: 2 }))).toBeVisible();
    await attention.getByRole('button', { name: t('fillIn') }).click();
    const list = page.getByRole('list', { name: t('needsList') });
    await expect(list.getByRole('link')).toHaveCount(2);
    await expectNoAxeViolations(page, `Aandacht nodig with attendance in ${appLocale}`);

    // Anna's private session: the page of the first link; Kracht: CO-01 with Iedereen aanwezig.
    await list.getByRole('link', { name: /Anna de Vries/ }).click();
    await group(page, copy, appLocale, 'Anna de Vries')
      .getByText(t('status.attended'), { exact: true })
      .click();
    await expect(page.getByRole('status').filter({ hasText: t('saved') })).toBeVisible();
    await page.goto(`/w/${w.slug}`);
    await expect(page.getByRole('main').getByText(t('needs', { count: 1 }))).toBeVisible();
    await page.getByRole('button', { name: t('fillIn') }).click();
    await page
      .getByRole('list', { name: t('needsList') })
      .getByRole('link')
      .click();
    await expect(page).toHaveURL(new RegExp(`/classes/${classId}/${kracht}$`));
    await page.getByRole('button', { name: t('everyone') }).click();
    await expect(page.getByText(t('summary', { attended: 2, noShow: 0, open: 0 }))).toBeVisible();

    await page.goto(`/w/${w.slug}`);
    await expect(
      page.getByRole('heading', { name: copy.workspaceDashboard.attentionTitle }),
    ).toBeVisible();
    await expect(page.getByRole('main').getByText(t('needs', { count: 1 }))).toHaveCount(0);
    await expect(page.getByRole('main').getByText(t('needs', { count: 2 }))).toHaveCount(0);
    await expect(page.getByRole('button', { name: t('fillIn') })).toHaveCount(0);
  });

  test('#547 AC2: Mijn dag nudges once the session has ended, with Aanwezig and Niet verschenen, and not while it runs', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    // A session that ended today needs a day that began more than two hours ago (Dutch time).
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Amsterdam',
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(new Date()),
    );
    test.skip(hour < 2, 'a session of today that has ended needs the day to be two hours old');
    const t = text(appLocale, copy);
    const w = await team(page, context);
    const anna = await seedClient(page.request, w.base, 'Anna de Vries');
    const bram = await seedClient(page.request, w.base, 'Bram Jansen');
    const ended = await seedPrivate(page.request, w.base, {
      clientId: anna.id,
      trainerId: w.trainer('Sarah'),
      localDate: inDays(4),
      localStart: '09:00',
    });
    const now = Date.now();
    await moveSessionTo(ended.id, new Date(now - 90 * MINUTE), new Date(now - 30 * MINUTE));
    const during = await seedPrivate(page.request, w.base, {
      clientId: bram.id,
      trainerId: w.trainer('Sarah'),
      localDate: inDays(5),
      localStart: '09:00',
    });
    await moveSessionTo(during.id, ...running());

    await signInWithSession(context, w.sarah);
    await page.goto('/me/day');
    // The nudge is under Anna's session and not under Bram's, which is still running.
    await expect(page.getByText(t('nudge'), { exact: true })).toHaveCount(1);
    const nudge = page.getByRole('group', { name: t('nudgeFor', { name: 'Anna de Vries' }) });
    await expect(nudge.getByRole('button')).toHaveCount(2);
    await expectNoAxeViolations(page, `Mijn dag with the nudge in ${appLocale}`);

    await nudge.getByRole('button', { name: t('status.noShow') }).click();
    await expect(page.getByText(t('nudge'), { exact: true })).toHaveCount(0);
    expect((await participantsOf(page, w, ended.id)).participants[0]?.status).toBe('no_show');
    expect((await storedSession(page.request, w.base, ended.id)).id).toBe(ended.id);
    // It stays gone after the page asks the server again.
    await page.reload();
    await expect(page.getByText(t('nudge'), { exact: true })).toHaveCount(0);
  });
});
