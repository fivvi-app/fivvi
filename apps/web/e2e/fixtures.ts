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
const MAX_SETTLE_ATTEMPTS = 3;

/**
 * How long the page may keep running animations before the check fails. Real time: Chromium
 * slows the fade down to 3 s in the test that sets the playback rate to a twentieth.
 */
const SETTLE_TIMEOUT_MS = 5_000;

/** `window` with the counter `settleAnimations` keeps of the CSS transitions and animations that start. */
type E2EWindow = Window & { __e2eAnimationStarts?: number };

/**
 * Waits until every running CSS transition and animation that has an end has finished, checking
 * on every animation frame, and returns how many CSS transitions and animations have started on
 * the page since the first call. Axe reads the colours the page shows at that moment, and a
 * control fading in (a button leaving its disabled state) shows a blend that fails contrast
 * (#203). Looping and paused animations never finish and are left alone. Animations still running
 * after SETTLE_TIMEOUT_MS (one that restarts all the time) fail the check, named.
 */
async function settleAnimations(page: Page): Promise<number> {
  const { started, unsettled } = await page.evaluate(async (timeoutMs) => {
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
    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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
    const deadline = performance.now() + timeoutMs;
    let running = runningFinite();
    while (running.length > 0 && performance.now() < deadline) {
      await nextFrame();
      running = runningFinite();
    }
    return { started: win.__e2eAnimationStarts, unsettled: running.map(describe) };
  }, SETTLE_TIMEOUT_MS);
  if (unsettled.length > 0) {
    throw new Error(
      `The page did not settle within ${SETTLE_TIMEOUT_MS} ms, so axe cannot judge it; still running: ${unsettled.join(', ')}.`,
    );
  }
  return started;
}

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
 * page before a language switch). It waits for running CSS transitions and animations first, and
 * repeats the run when one started while axe was looking, so a fade never counts as a violation.
 */
export async function expectNoAxeViolations(page: Page, state = 'the page'): Promise<void> {
  let found: AxeViolationSummary[] = [];
  for (let attempt = 1; attempt <= MAX_SETTLE_ATTEMPTS; attempt++) {
    const startsBefore = await settleAnimations(page);
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
