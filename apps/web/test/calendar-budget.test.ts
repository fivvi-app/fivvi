import { describe, expect, it } from 'vitest';
import {
  CALENDAR_RENDER_BUDGET_MS,
  CALENDAR_REQUEST_BUDGET_MS,
  type CalendarTiming,
  calendarFailures,
  calendarSignInCode,
  parseRailwayLog,
  railwayEnvironmentOf,
  signInLogEnvironment,
  summarizeCalendarTiming,
} from './calendar-budget';

const timing = (overrides: Partial<CalendarTiming> = {}): CalendarTiming => ({
  locale: 'en',
  sessions: 45,
  requestMs: [210, 180, 190],
  renderMs: [820, 640, 610],
  ...overrides,
});

// F014 AC15 (#1543): the pilot-shaped week is timed on the preview, in the budgets run.
describe('F014 AC15 calendarFailures', () => {
  it('holds the spec budgets: the request within 500 ms, the render within 1 s', () => {
    expect(CALENDAR_REQUEST_BUDGET_MS).toBe(500);
    expect(CALENDAR_RENDER_BUDGET_MS).toBe(1000);
  });

  it('counts the best of the runs, as the budgets of the site do', () => {
    expect(calendarFailures(timing())).toEqual([]);
    expect(
      calendarFailures(timing({ requestMs: [900, 480, 700], renderMs: [1400, 990, 1200] })),
    ).toEqual([]);
  });

  it('names the budget that is over, and a run that is missing counts as over', () => {
    expect(calendarFailures(timing({ requestMs: [510, 600] }))).toEqual(['request']);
    expect(calendarFailures(timing({ renderMs: [1000, 1500] }))).toEqual(['render']);
    expect(calendarFailures(timing({ requestMs: [], renderMs: [] }))).toEqual([
      'request',
      'render',
    ]);
  });
});

describe('F014 AC15 railwayEnvironmentOf', () => {
  it('maps the address of a PR preview to its Railway environment', () => {
    expect(railwayEnvironmentOf('https://web-fivvi-pr-1543.up.railway.app')).toBe('fivvi-pr-1543');
  });

  it('knows no environment for any other address: the caller names it', () => {
    expect(railwayEnvironmentOf('https://fivvi.app')).toBeUndefined();
    expect(railwayEnvironmentOf('https://web-development-1a2b.up.railway.app')).toBeUndefined();
    expect(railwayEnvironmentOf('http://localhost:3100')).toBeUndefined();
  });
});

describe('F014 AC15 signInLogEnvironment', () => {
  it('is the environment of the preview, or the one the run names for another address', () => {
    expect(signInLogEnvironment('https://web-fivvi-pr-1543.up.railway.app', undefined)).toBe(
      'fivvi-pr-1543',
    );
    expect(signInLogEnvironment('https://web-x1.up.railway.app', 'development')).toBe(
      'development',
    );
    expect(signInLogEnvironment('https://web-fivvi-pr-1543.up.railway.app', ' fivvi-pr-9 ')).toBe(
      'fivvi-pr-9',
    );
  });

  it('asks for the environment when the address does not say, and never reads the log of production', () => {
    expect(() => signInLogEnvironment('https://web-x1.up.railway.app', undefined)).toThrow(
      /BUDGETS_RAILWAY_ENVIRONMENT/,
    );
    expect(() => signInLogEnvironment('https://fivvi.app', 'production')).toThrow(/production/);
    expect(() => signInLogEnvironment('https://fivvi.app', undefined)).toThrow(
      /BUDGETS_RAILWAY_ENVIRONMENT/,
    );
  });
});

// `railway logs --json` prints one object per line; Railway does not keep the lines of one
// multi-line message in order, so the sign-in code is found by its neighbours, not its position.
describe('F014 AC15 calendarSignInCode', () => {
  const line = (message: string, timestamp: string) =>
    JSON.stringify({ level: 'info', message, timestamp });
  const email = (address: string, code: string, second: string) => [
    line('[email] not sent, logged instead (sign-in)', `2026-11-22T20:59:${second}.850000000Z`),
    line(`To: ${address}`, `2026-11-22T20:59:${second}.850556252Z`),
    line('Gebruik deze code om in te loggen bij Fivvi:', `2026-11-22T20:59:${second}.850584271Z`),
    line(code, `2026-11-22T20:59:${second}.850597591Z`),
    line(
      'Of open de inloglink en bevestig dat jij het bent:',
      `2026-11-22T20:59:${second}.850557152Z`,
    ),
  ];

  it('reads the code of the email to the address', () => {
    const entries = parseRailwayLog(email('paula@example.com', '300039', '31').join('\n'));
    expect(calendarSignInCode(entries, 'paula@example.com', new Set())).toEqual({
      code: '300039',
      timestamp: '2026-11-22T20:59:31.850597591Z',
    });
  });

  it('ignores the email of another address, even one logged a moment apart', () => {
    const entries = parseRailwayLog(
      [
        ...email('sven@example.com', '111111', '31'),
        ...email('paula@example.com', '222222', '32'),
      ].join('\n'),
    );
    expect(calendarSignInCode(entries, 'paula@example.com', new Set())?.code).toBe('222222');
    expect(calendarSignInCode(entries, 'noor@example.com', new Set())).toBeUndefined();
  });

  it('skips the codes that were in the log before the request, and takes the newest of the rest', () => {
    const entries = parseRailwayLog(
      [
        ...email('paula@example.com', '111111', '10'),
        ...email('paula@example.com', '222222', '40'),
      ].join('\n'),
    );
    const before = new Set(['2026-11-22T20:59:10.850597591Z']);
    expect(calendarSignInCode(entries, 'paula@example.com', before)?.code).toBe('222222');
    expect(
      calendarSignInCode(
        entries,
        'paula@example.com',
        new Set([...before, '2026-11-22T20:59:40.850597591Z']),
      ),
    ).toBeUndefined();
  });

  it('skips lines that are not log entries and a number that is not a code', () => {
    const entries = parseRailwayLog(
      [
        'Starting Container',
        line('To: paula@example.com', '2026-11-22T20:59:31.850Z'),
        line('1234567', '2026-11-22T20:59:31.851Z'),
        '{broken',
      ].join('\n'),
    );
    expect(entries).toHaveLength(2);
    expect(calendarSignInCode(entries, 'paula@example.com', new Set())).toBeUndefined();
  });
});

describe('F014 AC15 summarizeCalendarTiming', () => {
  it('says what was measured and against what, with one line per language', () => {
    const summary = summarizeCalendarTiming({
      target: 'https://web-fivvi-pr-1543.up.railway.app',
      rows: [timing(), timing({ locale: 'nl-NL', renderMs: [1200, 1300] })],
    });
    expect(summary).toContain('https://web-fivvi-pr-1543.up.railway.app');
    expect(summary).toContain('Pilot Gym');
    expect(summary).toContain('1 of 2 over budget');
    const lines = summary
      .split('\n')
      .filter((l) => l.startsWith('| en') || l.startsWith('| nl-NL'));
    expect(lines).toEqual([
      '| en | 45 | 180 ms (210, 180, 190) | 610 ms (820, 640, 610) | pass |',
      '| nl-NL | 45 | 180 ms (210, 180, 190) | 1200 ms (1200, 1300) | fail (render) |',
    ]);
  });
});
