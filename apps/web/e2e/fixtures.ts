import AxeBuilder from '@axe-core/playwright';
import { type Locale, locales, type Messages, messages } from '@fivvi/i18n';
import { type BrowserContext, test as base, expect, type Page } from '@playwright/test';

/** Options each Playwright project sets (playwright.config.ts). */
export interface E2EOptions {
  /** The catalog locale this project runs in. */
  appLocale: Locale;
}

interface E2EFixtures {
  /** The catalog for `appLocale`. Assert on copy from here, never on hard-coded text. */
  messages: Messages;
  /** The locale this project does not run in, for switching languages. */
  otherLocale: Locale;
  /** Runs the axe check on the page as the test left it (automatic). */
  axeAfterEach: undefined;
  /**
   * Fails the test on any `securitypolicyviolation` event in any page of any browser context it
   * opens (automatic, E013 AC9). A test that provokes a violation on purpose reads and drains it
   * here (`e2e/csp.spec.ts`).
   */
  cspViolations: CspViolations;
}

/** One `securitypolicyviolation` event, as far as it says what was blocked and where. */
export interface CspViolation {
  /** The directive that blocked it, for example `script-src-elem`. */
  directive: string;
  /** What it blocked: a URL, or `inline`, `eval`, … */
  blocked: string;
  /** The page it happened on. */
  page: string;
  /** The first characters of the blocked inline code, when the browser says. */
  sample: string;
}

/** The violations the browser reported during the test. */
export interface CspViolations {
  /** Every violation reported so far and not drained. */
  all(): readonly CspViolation[];
  /** Takes the violations out, so the test does not fail on those it expected. */
  drain(): CspViolation[];
}

/** The name of the binding that carries a violation from a page to the test. */
const REPORT_CSP_VIOLATION = '__fivviReportCspViolation';

/**
 * Runs in every frame of every page of a context, before the page's own scripts (the browser
 * installs it past the page's policy): reports each `securitypolicyviolation` event to the test.
 */
function listenForCspViolations(report: string): void {
  document.addEventListener(
    'securitypolicyviolation',
    (event) => {
      const send = (
        window as unknown as Record<string, ((violation: unknown) => void) | undefined>
      )[report];
      send?.({
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
        page: event.documentURI,
        sample: event.sample,
      });
    },
    true,
  );
}

/** Starts reporting the violations of `context` (and of the frames of its pages) to `found`. */
async function watchCspViolations(context: BrowserContext, found: CspViolation[]): Promise<void> {
  await context.exposeBinding(REPORT_CSP_VIOLATION, (_source, violation: CspViolation) => {
    found.push(violation);
  });
  await context.addInitScript(listenForCspViolations, REPORT_CSP_VIOLATION);
}

/** WCAG 2.2 A and AA, the level the product commits to. */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

/**
 * The most axe runs one check makes. A run is repeated while it found violations and a CSS
 * transition or animation started during it; the last run's result counts.
 */
const MAX_AXE_RUNS = 3;

/**
 * How long a check lets the page keep running animations before it fails, in real time. It must
 * exceed the longest finite animation a check waits for: Chromium slows the 150 ms fade of the
 * sign-in button down to 3 s in the test that sets the playback rate to a twentieth. It only
 * bounds how long a failure takes; a page that settles is released on the frame it does.
 */
const SETTLE_TIMEOUT_MS = 5_000;

/** `window` with what `waitForAnimationsToSettle` installs: a counter of the CSS transitions and animations that start, and the list of finite animations running now. */
type E2EWindow = Window & {
  __e2eAnimationStarts?: number;
  __e2eRunningFinite?: () => Animation[];
};

/**
 * Waits until every running finite animation on the page has finished, checking on every
 * animation frame: CSS transitions, CSS animations and Web Animations alike. Axe reads the
 * colours the page shows at that moment, and a control fading in (a button leaving its disabled
 * state) shows a blend that fails contrast (#203). Looping and paused animations never finish and
 * are left alone. Animations still running after `timeoutMs` (one that restarts all the time) fail
 * the check, named; the deadline holds even when no frames fire (a hidden page). It also starts
 * the counter `animationActivity` reads, so call it before reading that.
 */
async function waitForAnimationsToSettle(page: Page, timeoutMs: number): Promise<void> {
  const unsettled = await page.evaluate(async (timeoutMs) => {
    const win = window as E2EWindow;
    if (win.__e2eAnimationStarts === undefined) {
      win.__e2eAnimationStarts = 0;
      const count = () => {
        win.__e2eAnimationStarts = (win.__e2eAnimationStarts ?? 0) + 1;
      };
      document.addEventListener('transitionrun', count, true);
      document.addEventListener('animationstart', count, true);
      // `running` also covers an animation whose start is still pending; a paused one reads
      // `paused`. Asking for the animations also brings the page's styles up to date, so a
      // transition that is due to start has started.
      win.__e2eRunningFinite = () =>
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.playState === 'running' &&
              animation.effect?.getComputedTiming().endTime !== Infinity,
          );
    }
    const runningFinite = () => win.__e2eRunningFinite?.() ?? [];
    const deadline = performance.now() + timeoutMs;
    // Resolves on the next frame, or at the deadline when no frame comes.
    const nextFrameOrDeadline = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
        setTimeout(resolve, Math.max(0, deadline - performance.now()));
      });
    const describe = (animation: Animation) => {
      const target =
        animation.effect instanceof KeyframeEffect ? animation.effect.target : undefined;
      const element = target
        ? `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ''}`
        : 'no element';
      const name =
        animation instanceof CSSAnimation
          ? `animation "${animation.animationName}"`
          : animation instanceof CSSTransition
            ? `transition "${animation.transitionProperty}"`
            : 'Web Animation';
      return `${element} ${name}`;
    };
    let running = runningFinite();
    while (running.length > 0 && performance.now() < deadline) {
      await nextFrameOrDeadline();
      running = runningFinite();
    }
    return running.map(describe);
  }, timeoutMs);
  if (unsettled.length > 0) {
    throw new Error(
      `The page did not settle within ${timeoutMs} ms, so axe cannot judge it; still running: ${unsettled.join(', ')}.`,
    );
  }
}

/**
 * What changed on the page since the first wait: how many CSS transitions and animations have
 * started (Web Animations are not counted), and how many finite animations run now. A transition
 * announces itself with an event only on the next frame, and a busy page (hydrating, or axe itself)
 * can hold that frame back for as long as axe reads the page (#287); the running ones are counted
 * without waiting for the event.
 */
async function animationActivity(page: Page): Promise<{ started: number; running: number }> {
  return await page.evaluate(() => {
    const win = window as E2EWindow;
    return {
      started: win.__e2eAnimationStarts ?? 0,
      running: win.__e2eRunningFinite?.().length ?? 0,
    };
  });
}

interface AxeViolationSummary {
  id: string;
  impact: string | null | undefined;
  help: string;
  targets: string[];
}

/**
 * Fails when axe finds accessibility violations on the page. Every test gets this on its
 * final page automatically; call it yourself for states in between (an open dialog, the
 * page before a language switch). It waits for running finite animations first (`settleTimeoutMs`
 * caps the wait), and repeats the run when a CSS transition or animation was already running when
 * axe began, started while axe was looking or is still running when axe is done, so a fade never
 * counts as a violation.
 */
export async function expectNoAxeViolations(
  page: Page,
  state = 'the page',
  {
    settleTimeoutMs = SETTLE_TIMEOUT_MS,
    tags = WCAG_TAGS,
  }: {
    settleTimeoutMs?: number;
    /** The axe rule tags to run: WCAG 2.2 A and AA by default; the public site adds `best-practice` (F064 AC15). */
    tags?: readonly string[];
  } = {},
): Promise<void> {
  let found: AxeViolationSummary[] = [];
  for (let run = 1; run <= MAX_AXE_RUNS; run++) {
    await waitForAnimationsToSettle(page, settleTimeoutMs);
    const before = await animationActivity(page);
    const { violations } = await new AxeBuilder({ page }).withTags([...tags]).analyze();
    found = violations.map(({ id, impact, help, nodes }) => ({
      id,
      impact,
      help,
      targets: nodes.map((node) => node.target.join(' ')),
    }));
    // Trust the result unless something was already animating when axe began (a fade can start in
    // the moment between the wait and `before`, with its event already in `before`, and be over
    // by `after`, #1386), started animating while axe was reading the page, or is animating now
    // (its start event may not have come yet).
    if (found.length === 0) break;
    const after = await animationActivity(page);
    if (before.running === 0 && after.started === before.started && after.running === 0) break;
  }
  expect(found, `axe violations on ${state}`).toEqual([]);
}

/** WCAG 2.2 A and AA and axe's best practices (landmarks, headings, regions): what the public site must pass. */
export const SITE_AXE_TAGS: readonly string[] = [...WCAG_TAGS, 'best-practice'];

export const test = base.extend<E2EOptions & E2EFixtures>({
  appLocale: ['nl-NL', { option: true }],

  messages: async ({ appLocale }, provide) => {
    await provide(messages[appLocale]);
  },

  otherLocale: async ({ appLocale }, provide) => {
    const other = locales.find((locale) => locale !== appLocale);
    if (!other) throw new Error('Expected at least two catalog locales.');
    await provide(other);
  },

  axeAfterEach: [
    async ({ page }, provide, testInfo) => {
      await provide(undefined);
      // Skip when the test already failed or never opened a page.
      if (testInfo.status !== testInfo.expectedStatus || page.url() === 'about:blank') return;
      await expectNoAxeViolations(page, `${page.url()} at the end of the test`);
    },
    { auto: true },
  ],

  // E013 AC9: no page of any test, in either language, breaks under the Content-Security-Policy.
  // Watches the test's own context and every context the test opens with `browser.newContext()`.
  cspViolations: [
    async ({ browser, context }, provide, testInfo) => {
      const found: CspViolation[] = [];
      await watchCspViolations(context, found);
      const newContext = browser.newContext.bind(browser);
      browser.newContext = (async (...args: Parameters<typeof newContext>) => {
        const opened = await newContext(...args);
        await watchCspViolations(opened, found);
        return opened;
      }) as typeof browser.newContext;

      await provide({ all: () => found, drain: () => found.splice(0) });

      browser.newContext = newContext;
      // A test that failed already says why; its violations would only add noise.
      if (testInfo.status !== testInfo.expectedStatus) return;
      expect(
        found.map(
          ({ directive, blocked, page, sample }) =>
            `${directive} blocked ${blocked}${sample ? ` (${sample})` : ''} on ${page}`,
        ),
        'Content-Security-Policy violations in the browser',
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
