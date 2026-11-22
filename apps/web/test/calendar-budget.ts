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

/** One run of the week: the calendar request and the render of the same pass. */
export interface CalendarRun {
  requestMs: number;
  renderMs: number;
}

const over = (run: CalendarRun) => {
  const failures: string[] = [];
  if (!(run.requestMs < CALENDAR_REQUEST_BUDGET_MS)) failures.push('request');
  if (!(run.renderMs < CALENDAR_RENDER_BUDGET_MS)) failures.push('render');
  return failures;
};

/** How far a run is over its tightest budget: below 1 is within both. */
const closeness = (run: CalendarRun) =>
  Math.max(run.requestMs / CALENDAR_REQUEST_BUDGET_MS, run.renderMs / CALENDAR_RENDER_BUDGET_MS);

/**
 * The run that counts: the first one within both budgets, else the one closest to them (so a failure
 * names the numbers of one real run, never the best request of one run beside the best render of
 * another). `undefined` when there is no run.
 */
export function countedRun(timing: CalendarTiming): CalendarRun | undefined {
  const runs: CalendarRun[] = [];
  for (let i = 0; i < Math.min(timing.requestMs.length, timing.renderMs.length); i++) {
    runs.push({ requestMs: timing.requestMs[i] as number, renderMs: timing.renderMs[i] as number });
  }
  const passing = runs.find((run) => over(run).length === 0);
  if (passing) return passing;
  return runs.reduce<CalendarRun | undefined>(
    (closest, run) => (!closest || closeness(run) < closeness(closest) ? run : closest),
    undefined,
  );
}

/** The budgets the counted run is over, by name; no run counts as over both. */
export function calendarFailures(timing: CalendarTiming): string[] {
  const run = countedRun(timing);
  return run ? over(run) : ['request', 'render'];
}

/**
 * The project of the Railway CLI calls: `RAILWAY_PROJECT_ID` when the environment sets it, else the
 * project `scripts/_lib.sh` names (`RAILWAY_PROJECT_ID`, the one place the constant is kept; the shell
 * scripts do not depend on this file).
 */
export function railwayProjectId(env: Record<string, string | undefined>): string {
  return env.RAILWAY_PROJECT_ID?.trim() || '5ac2d844-191a-4671-9632-50b66817f648';
}

const PREVIEW_HOST = /^web-(fivvi-pr-\d+)\.up\.railway\.app$/;
/** The development deploy: Railway names its domain `<service>-<environment>-<hash>`. */
const DEVELOPMENT_HOST = /^web-development-[a-z0-9]+\.up\.railway\.app$/;
/** The only Railway environments whose log the run reads. */
const READABLE_ENVIRONMENT = /^(development|fivvi-pr-\d+)$/;

/** The Railway environment of an address that may be timed, or `undefined` for any other. */
function environmentOfTarget(target: string): string | undefined {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.pathname !== '/') return undefined;
  const preview = PREVIEW_HOST.exec(url.host)?.[1];
  if (preview) return preview;
  return DEVELOPMENT_HOST.test(url.host) ? 'development' : undefined;
}

/**
 * Why an address is not timed, or `undefined` when it is a PR preview (`web-fivvi-pr-<n>`) or the
 * development deploy (`web-development-<hash>`): the only two that have the Pilot Gym seed and a log
 * that holds no real data. Every other address, production (`fivvi.app`, `web-production-*`) above
 * all, is refused whatever any variable says.
 */
export function calendarTargetRefusal(target: string): string | undefined {
  if (environmentOfTarget(target)) return undefined;
  return `${target} is not a PR preview (https://web-fivvi-pr-<n>.up.railway.app) or the development deploy (https://web-development-<id>.up.railway.app): the calendar budget is timed on those only, never on production (real data, docs/agents/tools.md).`;
}

/**
 * The Railway environment whose log holds the sign-in code of the run: the preview's own
 * (`web-fivvi-pr-<n>` is `fivvi-pr-<n>`) or `development` for the development deploy. The address
 * decides; `BUDGETS_RAILWAY_ENVIRONMENT` (`named`) may only repeat it, and must be exactly
 * `development` or `fivvi-pr-<n>` that agrees with the address. The log of production is never read:
 * it can hold real data (docs/agents/tools.md).
 */
export function signInLogEnvironment(target: string, named: string | undefined): string {
  const refusal = calendarTargetRefusal(target);
  if (refusal) throw new Error(refusal);
  const expected = environmentOfTarget(target) as string;
  const environment = named?.trim() || expected;
  if (!READABLE_ENVIRONMENT.test(environment)) {
    throw new Error(
      `BUDGETS_RAILWAY_ENVIRONMENT "${environment}" is not development or fivvi-pr-<n>: the log of any other environment is never read.`,
    );
  }
  if (environment !== expected) {
    throw new Error(
      `${target} is in the Railway environment ${expected}, not "${environment}": BUDGETS_RAILWAY_ENVIRONMENT must agree with the address.`,
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
 * counted run (the first within both budgets, else the closest) and every run of the request and of
 * the render, and the verdict.
 */
export function summarizeCalendarTiming({
  target,
  rows,
}: {
  target: string | undefined;
  rows: readonly CalendarTiming[];
}): string {
  const overBudget = rows.filter((row) => calendarFailures(row).length > 0).length;
  const verdict =
    overBudget === 0
      ? `all ${rows.length} within budget`
      : `${overBudget} of ${rows.length} over budget`;
  const lines = [
    `**Workspace calendar week budget (F014 AC15)**: ${verdict}`,
    '',
    `Measured on ${target ?? 'the local build'}: *Agenda* (week view) of Pilot Gym, ` +
      `${PILOT_WEEK.from} to ${PILOT_WEEK.to}, signed in as its Owner. Budgets: one calendar request ` +
      `< ${CALENDAR_REQUEST_BUDGET_MS} ms, render < ${CALENDAR_RENDER_BUDGET_MS} ms ` +
      `(of up to 3 runs, the first one within both counts, else the closest; every run is in brackets).`,
    '',
    '| Language | Sessions | Calendar request | Render | Result |',
    '|---|---|---|---|---|',
  ];
  for (const row of rows) {
    const failures = calendarFailures(row);
    const counted = countedRun(row);
    const shown = (ms: number | undefined) =>
      ms === undefined ? 'no run' : `${Math.round(ms)} ms`;
    lines.push(
      `| ${row.locale} | ${row.sessions} | ${shown(counted?.requestMs)} (${listed(row.requestMs)}) | ` +
        `${shown(counted?.renderMs)} (${listed(row.renderMs)}) | ` +
        `${failures.length === 0 ? 'pass' : `fail (${failures.join(', ')})`} |`,
    );
  }
  return lines.join('\n');
}
