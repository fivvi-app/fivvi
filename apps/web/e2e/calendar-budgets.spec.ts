import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Messages } from '@fivvi/i18n';
import type { Page } from '@playwright/test';
import { budgetsTarget } from '../test/budgets';
import {
  CALENDAR_RENDER_BUDGET_MS,
  CALENDAR_REQUEST_BUDGET_MS,
  CALENDAR_TIMING_ANNOTATION,
  type CalendarTiming,
  calendarFailures,
  calendarSignInCode,
  calendarTargetRefusal,
  type LogEntry,
  PILOT_WEEK,
  parseRailwayLog,
  railwayProjectId,
  signInLogEnvironment,
} from '../test/calendar-budget';
import { expect, test } from './fixtures';

// F014 AC15 (spec #458, bug #1543): the seeded pilot-shaped week of Pilot Gym (15 class dates and
// 30 private sessions, Monday 21 to Sunday 27 September 2026) loads with one calendar request that
// answers within 500 ms and renders within 1 s, timed on a deployed preview. The local AC15 test
// (`workspace-calendar.spec.ts`) times a gym of 5 sessions that it plans itself; this one reads what
// a preview and the development deploy already have, and writes nothing.
//
// It runs in the budgets run only, against a deployed address (`BUDGETS_BASE_URL`, playwright.config.ts):
//
//   BUDGETS_BASE_URL=https://web-fivvi-pr-<n>.up.railway.app pnpm --filter @fivvi/web test:budgets calendar-budgets
//
// Signing in. A preview has no database for the test to reach, and no inbox: outside production the
// sign-in email to an `@example.com` address is written to the server's log, code included
// (ENVIRONMENTS.md, "Sign-in emails outside production"). So the test signs in the way a person
// does, on the sign-in page, and reads the code from the `web` deployment's log with the `railway`
// CLI, which agents may use on previews and `development` (docs/agents/tools.md). No back door:
// the code is the one the server sent. The environment is the preview's own
// (`web-fivvi-pr-<n>` is `fivvi-pr-<n>`, `web-development-<id>` is `development`);
// `BUDGETS_RAILWAY_ENVIRONMENT` may only repeat it. Any other address, production above all, skips
// the test: it is never signed in on and its log is never read.
//
// Each language signs in once: an address gets three codes per 15 minutes.
const RAILWAY_PROJECT_ID = railwayProjectId(process.env);
const MAX_ATTEMPTS = 3;
const run = promisify(execFile);

/** What the `web` log of the environment holds now (the last 500 lines of the latest deployment). */
async function readLog(environment: string): Promise<LogEntry[]> {
  const { stdout } = await run(
    'railway',
    ['logs', '-p', RAILWAY_PROJECT_ID, '-e', environment, '-s', 'web', '-d', '-n', '500', '--json'],
    { maxBuffer: 16 * 1024 * 1024, timeout: 60_000 },
  );
  return parseRailwayLog(stdout);
}

test.describe.configure({ mode: 'default', timeout: 180_000 });

test.describe('F014 AC15 the pilot-shaped week on a preview', () => {
  const target = budgetsTarget(process.env.BUDGETS_BASE_URL);
  test.skip(
    !target,
    'Timed on a deployed preview only: set BUDGETS_BASE_URL (the local AC15 test is in workspace-calendar.spec.ts).',
  );
  // `pnpm test:budgets` against production is a valid run for the site's budgets (#648): this
  // test skips there instead of failing the run.
  const refusal = target ? calendarTargetRefusal(target) : undefined;
  test.skip(Boolean(refusal), refusal);

  test('AC15: Agenda (week) of the seeded pilot week answers within 500 ms and renders within 1 s', async ({
    page,
    appLocale,
    messages: copy,
  }, testInfo) => {
    if (!target) return; // the describe-level skips above cover the refused targets
    const environment = signInLogEnvironment(target, process.env.BUDGETS_RAILWAY_ENVIRONMENT);
    await signInWithLog(page, environment, copy);

    // The workspace's ID, from the account's own workspaces (a read).
    const workspaces = (await (await page.request.get('/api/v1/me/workspaces')).json()) as {
      workspaceId: string;
      slug: string;
    }[];
    const workspaceId = workspaces.find(
      (workspace) => workspace.slug === PILOT_WEEK.slug,
    )?.workspaceId;
    if (!workspaceId) {
      throw new Error(
        `${PILOT_WEEK.owner} has no workspace "${PILOT_WEEK.slug}" on ${target}: it has no Pilot Gym seed (packages/database/src/seed-pilot-week.ts).`,
      );
    }
    const calendar = `/api/v1/workspaces/${workspaceId}/calendar?from=${PILOT_WEEK.from}&to=${PILOT_WEEK.to}`;
    const agenda = `/w/${PILOT_WEEK.slug}/calendar?date=${PILOT_WEEK.from}&view=week`;
    const blocks = page.getByRole('main').locator('button[aria-haspopup="dialog"]');

    // As the budgets of the site: a run on a busy network is slower, never faster, so a week that is
    // over a budget is measured again; the first run within both budgets counts, else the closest one,
    // and every run is in the result.
    const timing: CalendarTiming = { locale: appLocale, sessions: 0, requestMs: [], renderMs: [] };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const requested = Date.now();
      const response = await page.request.get(calendar);
      timing.requestMs.push(Date.now() - requested);
      expect(response.status(), calendar).toBe(200);
      timing.sessions = ((await response.json()) as { items: unknown[] }).items.length;

      const started = Date.now();
      await page.goto(agenda);
      await expect(blocks.first()).toBeVisible();
      timing.renderMs.push(Date.now() - started);

      if (calendarFailures(timing).length === 0) break;
    }

    testInfo.annotations.push({
      type: CALENDAR_TIMING_ANNOTATION,
      description: JSON.stringify(timing),
    });
    // The week is the pilot-shaped one, and the page shows it.
    expect(timing.sessions, 'sessions of the pilot week').toBeGreaterThanOrEqual(
      PILOT_WEEK.minSessions,
    );
    expect(await blocks.count(), 'blocks of the week on the page').toBeGreaterThan(0);
    expect(
      calendarFailures(timing),
      `request ${timing.requestMs.join(', ')} ms (< ${CALENDAR_REQUEST_BUDGET_MS}), render ${timing.renderMs.join(', ')} ms (< ${CALENDAR_RENDER_BUDGET_MS})`,
    ).toEqual([]);
  });
});

/**
 * Signs `PILOT_WEEK.owner` in on the sign-in page: asks for the code, reads the one that is new in
 * the log of `environment` and enters it.
 */
async function signInWithLog(page: Page, environment: string, copy: Messages): Promise<void> {
  const address = PILOT_WEEK.owner;
  const known = new Set<string>();
  for (const entry of await readLog(environment)) known.add(entry.timestamp);

  await page.goto('/login');
  await page.getByLabel(copy.signIn.emailLabel).fill(address);
  await page.getByRole('button', { name: copy.signIn.sendCode }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: copy.signIn.checkEmailTitle }),
  ).toBeVisible();

  // The email is sent after the answer, and Railway's log trails by a few seconds.
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        code = calendarSignInCode(await readLog(environment), address, known)?.code;
        return code;
      },
      {
        message: `the sign-in code of ${address} in the log of ${environment}`,
        timeout: 60_000,
        intervals: [2_000],
      },
    )
    .toBeDefined();
  await page.getByLabel(copy.signIn.codeLabel).fill(code ?? '');
  await page.getByRole('button', { name: copy.signIn.submitCode }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}
