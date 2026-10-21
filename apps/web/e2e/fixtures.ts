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
 * Fails when axe finds accessibility violations on the page. Every test gets this on its
 * final page automatically; call it yourself for states in between (an open dialog, the
 * page before a language switch).
 */
export async function expectNoAxeViolations(page: Page, state = 'the page'): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const found = violations.map(({ id, impact, help, nodes }) => ({
    id,
    impact,
    help,
    targets: nodes.map((node) => node.target.join(' ')),
  }));
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
