// The speed budget of the workspace calendar on a deployed preview (F014 AC15, #1543): what the
// budget is, which week and account it is timed on, how the sign-in code of that account is found
// without a database, and the summary of a run that goes on the PR. It lives outside `e2e/` so a
// unit test covers it; the spec (`e2e/calendar-budgets.spec.ts`) measures, the reporter
// (`e2e/budgets-reporter.ts`) prints.

/** AC15: the one calendar request of the week answers within 500 ms ... */
export const CALENDAR_REQUEST_BUDGET_MS = 500;
/** ... and the week renders within 1 s. */
export const CALENDAR_RENDER_BUDGET_MS = 1000;

/** The annotation the spec leaves for the reporter: its type, and a `CalendarTiming` as JSON. */
export const CALENDAR_TIMING_ANNOTATION = 'AC15 calendar timing';

/**
 * The seeded pilot-shaped week (`packages/database/src/seed-pilot-week.ts`, PR #1536): the workspace
 * Pilot Gym with its Owner, Monday 21 to Sunday 27 September 2026. It exists on every preview and
 * development deploy (never in production).
 */
export const PILOT_WEEK = {
  slug: 'pilot-gym',
  owner: 'paula@example.com',
  from: '2026-09-21',
  to: '2026-09-27',
  /** 15 class dates and 30 private sessions: a week that has fewer is not the pilot-shaped one. */
  minSessions: 45,
} as const;

/** What one language measured: the runs of the calendar request and of the render, in order. */
export interface CalendarTiming {
  locale: string;
  /** How many sessions the calendar answered for the week. */
  sessions: number;
  requestMs: number[];
  renderMs: number[];
}

const best = (runs: readonly number[]) => (runs.length === 0 ? Number.NaN : Math.min(...runs));

/** The budgets a measurement is over, by name; the best run counts, and no run counts as over. */
export function calendarFailures(timing: CalendarTiming): string[] {
  const failures: string[] = [];
  if (!(best(timing.requestMs) < CALENDAR_REQUEST_BUDGET_MS)) failures.push('request');
  if (!(best(timing.renderMs) < CALENDAR_RENDER_BUDGET_MS)) failures.push('render');
  return failures;
}

/**
 * The Railway environment of a PR preview's address (`web-fivvi-pr-<n>.up.railway.app` is
 * `fivvi-pr-<n>`), or `undefined` for any other address, which the run names itself
 * (`BUDGETS_RAILWAY_ENVIRONMENT`).
 */
export function railwayEnvironmentOf(target: string): string | undefined {
  return /^https:\/\/web-(fivvi-pr-\d+)\.up\.railway\.app$/.exec(target)?.[1];
}

/**
 * The Railway environment whose log holds the sign-in code of the run: the preview's own, or the one
 * `BUDGETS_RAILWAY_ENVIRONMENT` names (`development`, whose address the code does not know). The
 * log of `production` is never read: it can hold real data (docs/agents/tools.md), and the Pilot Gym
 * seed does not run there.
 */
export function signInLogEnvironment(target: string, named: string | undefined): string {
  const environment = named?.trim() || railwayEnvironmentOf(target);
  if (!environment) {
    throw new Error(
      `${target} is not a PR preview: set BUDGETS_RAILWAY_ENVIRONMENT (development, or fivvi-pr-<n>) to the environment whose log holds the sign-in code.`,
    );
  }
  if (environment === 'production') {
    throw new Error(
      'The calendar budget is never timed on production: its log can hold real data.',
    );
  }
  return environment;
}

/** One line of `railway logs --json`. */
export interface LogEntry {
  message: string;
  timestamp: string;
}

/** The entries of `railway logs --json` output: lines that are not log entries are left out. */
export function parseRailwayLog(output: string): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const line of output.split('\n')) {
    try {
      const value: unknown = JSON.parse(line);
      if (typeof value !== 'object' || value === null) continue;
      const { message, timestamp } = value as Record<string, unknown>;
      if (typeof message === 'string' && typeof timestamp === 'string') {
        entries.push({ message, timestamp });
      }
    } catch {
      // Not an entry (a banner, a cut-off line).
    }
  }
  return entries;
}

/** Lines of one email are logged within this many milliseconds of each other. */
const SAME_EMAIL_MS = 50;

/**
 * The newest sign-in code in the log of an email to `address` that was not there before the
 * request (`known`: the timestamps of the codes seen then). Outside production an `@example.com`
 * email is written to the server log instead of being sent (ENVIRONMENTS.md, "Sign-in emails
 * outside production"), one entry per line and not always in order, so the code (a line of six
 * digits) is tied to its email by the `To:` line logged next to it, not by its position.
 */
export function calendarSignInCode(
  entries: readonly LogEntry[],
  address: string,
  known: ReadonlySet<string>,
): { code: string; timestamp: string } | undefined {
  const at = (entry: LogEntry) => Date.parse(entry.timestamp);
  const recipients = entries.filter((entry) => entry.message === `To: ${address}`).map(at);
  let found: { code: string; timestamp: string } | undefined;
  for (const entry of entries) {
    if (!/^\d{6}$/.test(entry.message) || known.has(entry.timestamp)) continue;
    if (!recipients.some((time) => Math.abs(time - at(entry)) <= SAME_EMAIL_MS)) continue;
    if (!found || at(entry) >= Date.parse(found.timestamp)) {
      found = { code: entry.message, timestamp: entry.timestamp };
    }
  }
  return found;
}

const listed = (runs: readonly number[]) => runs.map((ms) => Math.round(ms)).join(', ');

/**
 * The result of a run as Markdown, short enough to paste on the PR: one line per language with the
 * best run and every run of the request and of the render, and the verdict.
 */
export function summarizeCalendarTiming({
  target,
  rows,
}: {
  target: string | undefined;
  rows: readonly CalendarTiming[];
}): string {
  const over = rows.filter((row) => calendarFailures(row).length > 0).length;
  const verdict =
    over === 0 ? `all ${rows.length} within budget` : `${over} of ${rows.length} over budget`;
  const lines = [
    `**Workspace calendar week budget (F014 AC15)**: ${verdict}`,
    '',
    `Measured on ${target ?? 'the local build'}: *Agenda* (week view) of Pilot Gym, ` +
      `${PILOT_WEEK.from} to ${PILOT_WEEK.to}, signed in as its Owner. Budgets: one calendar request ` +
      `< ${CALENDAR_REQUEST_BUDGET_MS} ms, render < ${CALENDAR_RENDER_BUDGET_MS} ms ` +
      `(the best of up to 3 runs counts; the runs are in brackets).`,
    '',
    '| Language | Sessions | Calendar request | Render | Result |',
    '|---|---|---|---|---|',
  ];
  for (const row of rows) {
    const failures = calendarFailures(row);
    lines.push(
      `| ${row.locale} | ${row.sessions} | ${Math.round(best(row.requestMs))} ms (${listed(row.requestMs)}) | ` +
        `${Math.round(best(row.renderMs))} ms (${listed(row.renderMs)}) | ` +
        `${failures.length === 0 ? 'pass' : `fail (${failures.join(', ')})`} |`,
    );
  }
  return lines.join('\n');
}
