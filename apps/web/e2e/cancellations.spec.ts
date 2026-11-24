import { formattingLocales, type Messages, type Locale } from '@fivvi/i18n';
import type { Page } from '@playwright/test';
import { createTranslator } from 'next-intl';
import { clientIpHeaders, signInWithSession } from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';
import { emailsTo, waitForEmails } from './lettermint';
import {
  seedClient,
  seedPrivate,
  storedSession,
  team,
  thursday,
  type World,
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

/** The translator of a namespace of the catalog, with the formatting of the project's locale. */
const translator = (locale: Locale, messages: Messages, namespace: string) =>
  createTranslator({ locale: formattingLocales[locale], messages, namespace });

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
    const t = translator(appLocale, copy, 'sessions.cancel');
    await signInWithSession(context, w.sarah);
    await page.goto(`/w/${w.slug}/sessions/${sarahs.id}`);

    await page.getByRole('button', { name: t('action'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t('title') });
    await expect(dialog.getByRole('radio', { name: t('whoClient') })).toBeChecked();
    await expect(dialog.getByText(t('nudgeQuestion'))).toBeVisible();
    await dialog.getByRole('button', { name: t('nudgeCancelAnyway') }).click();
    await expect(dialog.getByRole('checkbox', { name: t('notify', { client: anna.name }) })).not.toBeChecked();
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
    const t = translator(appLocale, copy, 'sessions.cancel');
    await signInWithSession(context, w.sarah);
    await page.goto(`/w/${w.slug}/sessions/${sarahs.id}`);

    await page.getByRole('button', { name: t('action'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t('title') });
    await expect(dialog.getByText(t('nudgeQuestion'))).toBeVisible();
    await expect(dialog.getByRole('button', { name: t('submit') })).toHaveCount(0);
    await dialog.getByRole('button', { name: t('nudgeReschedule') }).click();

    await expect(
      page.getByRole('dialog', { name: copy.sessions.reschedule.title }),
    ).toBeVisible();
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
    const t = translator(appLocale, copy, 'sessions.cancel');
    await page.goto(`/w/${w.slug}/sessions/${toms.id}`);

    await page.getByRole('button', { name: t('action'), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t('title') });
    await dialog.getByRole('radio', { name: t('whoUs') }).check();
    const box = dialog.getByRole('checkbox', { name: t('notify', { client: anna.name }) });
    await expect(box).toBeChecked();
    await expect(dialog.getByText(t('notifyNote', { email: anna.email, language: copy.sessions.form.languageNl }))).toBeVisible();
    await expectNoAxeViolations(page, `PS-06 Wij in ${appLocale}`);
    await dialog.getByRole('button', { name: t('submit') }).click();

    await expect(page.getByRole('status').filter({ hasText: t('done') })).toBeVisible();
    const after = await stored(page, w, toms.id);
    expect(after.cancellation?.initiator).toBe('workspace');
    expect(after.cancellation?.cancelledBy?.name).toBe('John');
    expect(await waitForEmails(anna.email)).toHaveLength(1);
  });

  test('AC3: the cancelled session page says who cancelled it and when, at the client’s request, and offers only Klantprofiel', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    test.slow();
    const { w, anna, sarahs } = await world(page, context);
    const sessions = translator(appLocale, copy, 'sessions.page');
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
    const t = translator(appLocale, copy, 'sessions.cancel');
    await signInWithSession(context, w.tom);

    await page.goto(`/w/${w.slug}/sessions/${toms.id}`);
    await expect(page.getByRole('button', { name: t('action'), exact: true })).toBeVisible();

    await page.goto(`/w/${w.slug}/sessions/${sarahs.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: t('action'), exact: true })).toHaveCount(0);
  });
});
