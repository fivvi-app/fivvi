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

/** How often an animation may start between settling and the end of the axe run before the run is repeated. */
const MAX_SETTLE_ATTEMPTS = 3;

/**
 * Waits until every CSS transition and animation on the page has finished, and returns how many
 * have started on it since the first call. Axe reads the colours the page shows at that moment,
 * and a control fading in (a button leaving its disabled state) shows a blend that fails
 * contrast (#203). Looping animations never finish and are left alone.
 */
async function settleAnimations(page: Page): Promise<number> {
  return await page.evaluate(async () => {
    const counter = window as unknown as { __e2eAnimationStarts?: number };
    if (counter.__e2eAnimationStarts === undefined) {
      counter.__e2eAnimationStarts = 0;
      const count = () => {
        counter.__e2eAnimationStarts = (counter.__e2eAnimationStarts ?? 0) + 1;
      };
      document.addEventListener('transitionrun', count, true);
      document.addEventListener('animationstart', count, true);
    }
    const finishing = () =>
      document
        .getAnimations()
        .filter(
          (animation) =>
            (animation.playState === 'running' || animation.pending) &&
            animation.effect?.getComputedTiming().endTime !== Infinity,
        );
    for (let pending = finishing(); pending.length > 0; pending = finishing()) {
      // A cancelled animation rejects `finished`; either way it is done.
      await Promise.allSettled(pending.map((animation) => animation.finished));
    }
    return counter.__e2eAnimationStarts;
  });
}

async function startedAnimations(page: Page): Promise<number> {
  return await page.evaluate(
    () => (window as unknown as { __e2eAnimationStarts?: number }).__e2eAnimationStarts ?? 0,
  );
}

/**
 * Fails when axe finds accessibility violations on the page. Every test gets this on its
 * final page automatically; call it yourself for states in between (an open dialog, the
 * page before a language switch). It waits for running transitions and animations first, and
 * repeats the run when one started while axe was looking, so a fade never counts as a violation.
 */
export async function expectNoAxeViolations(page: Page, state = 'the page'): Promise<void> {
  let found: unknown[] = [];
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
