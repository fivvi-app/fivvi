import AxeBuilder from '@axe-core/playwright';
import { type Locale, locales, type Messages, messages } from '@fivvi/i18n';
import { test as base, expect, type Page } from '@playwright/test';

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

/** `window` with the counter `waitForAnimationsToSettle` keeps of the CSS transitions and animations that start. */
type E2EWindow = Window & { __e2eAnimationStarts?: number };

/**
 * Waits until every running finite animation on the page has finished, checking on every
 * animation frame: CSS transitions, CSS animations and Web Animations alike. Axe reads the
 * colours the page shows at that moment, and a control fading in (a button leaving its disabled
 * state) shows a blend that fails contrast (#203). Looping and paused animations never finish and
 * are left alone. Animations still running after `timeoutMs` (one that restarts all the time) fail
 * the check, named; the deadline holds even when no frames fire (a hidden page). It also starts
 * the counter `startedAnimations` reads, so call it before reading that.
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
    }
    // `running` also covers an animation whose start is still pending; a paused one reads `paused`.
    const runningFinite = () =>
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === 'running' &&
            animation.effect?.getComputedTiming().endTime !== Infinity,
        );
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

/** How many CSS transitions and animations have started on the page since the first wait (Web Animations are not counted). */
async function startedAnimations(page: Page): Promise<number> {
  return await page.evaluate(() => (window as E2EWindow).__e2eAnimationStarts ?? 0);
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
 * caps the wait), and repeats the run when a CSS transition or animation started while axe was
 * looking, so a fade never counts as a violation.
 */
export async function expectNoAxeViolations(
  page: Page,
  state = 'the page',
  { settleTimeoutMs = SETTLE_TIMEOUT_MS }: { settleTimeoutMs?: number } = {},
): Promise<void> {
  let found: AxeViolationSummary[] = [];
  for (let run = 1; run <= MAX_AXE_RUNS; run++) {
    await waitForAnimationsToSettle(page, settleTimeoutMs);
    const startsBefore = await startedAnimations(page);
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    found = violations.map(({ id, impact, help, nodes }) => ({
      id,
      impact,
      help,
      targets: nodes.map((node) => node.target.join(' ')),
    }));
    // Trust the result unless something started animating while axe was reading the page.
    if (found.length === 0 || (await startedAnimations(page)) === startsBefore) break;
  }
  expect(found, `axe violations on ${state}`).toEqual([]);
}

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
});

export { expect };
