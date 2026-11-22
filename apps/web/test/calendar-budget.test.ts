import { describe, expect, it } from 'vitest';
import {
  CALENDAR_RENDER_BUDGET_MS,
  CALENDAR_REQUEST_BUDGET_MS,
  type CalendarTiming,
  calendarFailures,
  calendarSignInCode,
  calendarTargetRefusal,
  countedRun,
  parseRailwayLog,
  railwayProjectId,
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

  it('passes on a run that is within both budgets', () => {
    expect(calendarFailures(timing())).toEqual([]);
    expect(
      calendarFailures(timing({ requestMs: [900, 480, 700], renderMs: [1400, 990, 1200] })),
    ).toEqual([]);
  });

  it('needs one run that is within both budgets: the best request and the best render of different runs do not count', () => {
    // Run 1: fast request, slow render. Run 2: slow request, fast render. Neither run passes.
    const split = timing({ requestMs: [300, 900], renderMs: [1400, 600] });
    expect(calendarFailures(split)).not.toEqual([]);
    expect(countedRun(split)).toBeDefined();
  });

  it('names the budgets that the closest run is over, and no run counts as over', () => {
    expect(calendarFailures(timing({ requestMs: [510, 600], renderMs: [500, 400] }))).toEqual([
      'request',
    ]);
    expect(calendarFailures(timing({ requestMs: [200, 300], renderMs: [1000, 1500] }))).toEqual([
      'render',
    ]);
    expect(calendarFailures(timing({ requestMs: [], renderMs: [] }))).toEqual([
      'request',
      'render',
    ]);
  });
});

describe('F014 AC15 countedRun', () => {
  it('is the first run within both budgets', () => {
    expect(countedRun(timing({ requestMs: [900, 480, 200], renderMs: [500, 990, 100] }))).toEqual({
      requestMs: 480,
      renderMs: 990,
    });
  });

  it('is the run closest to both budgets when none is within them, and none when there is no run', () => {
    expect(
      countedRun(timing({ requestMs: [900, 520, 700], renderMs: [1400, 1100, 1900] })),
    ).toEqual({ requestMs: 520, renderMs: 1100 });
    expect(countedRun(timing({ requestMs: [], renderMs: [] }))).toBeUndefined();
  });
});

describe('F014 AC15 calendarTargetRefusal', () => {
  it.each([
    'https://web-fivvi-pr-1543.up.railway.app',
    'https://web-development-1a2b.up.railway.app',
  ])('allows a preview and the development deploy: %s', (target) => {
    expect(calendarTargetRefusal(target)).toBeUndefined();
  });

  it.each([
    'https://fivvi.app',
    'https://www.fivvi.app',
    'https://web-production-fake.up.railway.app',
    'https://web-staging-1a2b.up.railway.app',
    'https://web-fivvi-pr-12.up.railway.app.evil.example',
    'https://evil.example/web-fivvi-pr-12.up.railway.app',
    'http://web-fivvi-pr-12.up.railway.app',
    'http://localhost:3100',
  ])('refuses any other address, production first: %s', (target) => {
    expect(calendarTargetRefusal(target)).toMatch(/preview|development/);
  });
});

describe('F014 AC15 signInLogEnvironment', () => {
  const preview = 'https://web-fivvi-pr-1543.up.railway.app';
  const development = 'https://web-development-1a2b.up.railway.app';

  it('is the environment of the preview, or development for the development deploy', () => {
    expect(signInLogEnvironment(preview, undefined)).toBe('fivvi-pr-1543');
    expect(signInLogEnvironment(preview, ' fivvi-pr-1543 ')).toBe('fivvi-pr-1543');
    expect(signInLogEnvironment(development, undefined)).toBe('development');
    expect(signInLogEnvironment(development, 'development')).toBe('development');
  });

  it.each([
    ['production', preview],
    ['production', development],
    ['Production', development],
    ['PRODUCTION', 'https://fivvi.app'],
    ['development', 'https://fivvi.app'],
    ['development', 'https://www.fivvi.app'],
    ['development', 'https://web-production-fake.up.railway.app'],
    ['fivvi-pr-1', 'https://web-production-fake.up.railway.app'],
    // An environment ID, or any name that is not development or fivvi-pr-<n>:
    ['5ac2d844-191a-4671-9632-50b66817f648', preview],
    ['fivvi-pr-12 ; production', preview],
    ['Development', development],
    ['pr-1543', preview],
  ])('never reads the log of %s for %s', (environment, target) => {
    expect(() => signInLogEnvironment(target, environment)).toThrow();
  });

  it('needs the environment to agree with the address', () => {
    expect(() => signInLogEnvironment(preview, 'fivvi-pr-9')).toThrow(/fivvi-pr-1543/);
    expect(() => signInLogEnvironment(preview, 'development')).toThrow(/fivvi-pr-1543/);
    expect(() => signInLogEnvironment(development, 'fivvi-pr-1543')).toThrow(/development/);
  });
});

describe('F014 AC15 railwayProjectId', () => {
  it('is read from the environment when set, else the project of scripts/_lib.sh', () => {
    expect(railwayProjectId({ RAILWAY_PROJECT_ID: ' abc-123 ' })).toBe('abc-123');
    expect(railwayProjectId({})).toBe('5ac2d844-191a-4671-9632-50b66817f648');
    expect(railwayProjectId({ RAILWAY_PROJECT_ID: '' })).toBe(
      '5ac2d844-191a-4671-9632-50b66817f648',
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
      rows: [timing(), timing({ locale: 'nl-NL', requestMs: [210, 180], renderMs: [1200, 1300] })],
    });
    expect(summary).toContain('https://web-fivvi-pr-1543.up.railway.app');
    expect(summary).toContain('Pilot Gym');
    expect(summary).toContain('1 of 2 over budget');
    const lines = summary
      .split('\n')
      .filter((l) => l.startsWith('| en') || l.startsWith('| nl-NL'));
    expect(lines).toEqual([
      '| en | 45 | 210 ms (210, 180, 190) | 820 ms (820, 640, 610) | pass |',
      '| nl-NL | 45 | 210 ms (210, 180) | 1200 ms (1200, 1300) | fail (render) |',
    ]);
  });
});
