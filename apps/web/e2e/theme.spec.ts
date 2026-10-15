import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Locator, Page } from '@playwright/test';
import { expect, expectNoAxeViolations, test } from './fixtures';

type ColorScheme = 'light' | 'dark';
const colorSchemes: ColorScheme[] = ['light', 'dark'];

// The expected colours come from the generated token CSS, light on `:root` and dark in the
// `prefers-color-scheme: dark` block, so the test follows a token change without edits.
const tokensCss = readFileSync(
  createRequire(import.meta.url).resolve('@trainer-hub/design-tokens/tokens.css'),
  'utf8',
);
const [lightCss = '', darkCss = ''] = tokensCss.split('@media (prefers-color-scheme: dark)');

/** A semantic colour token (`bg.canvas`) as the browser computes it (`rgb(246, 246, 247)`). */
function tokenColour(token: string, scheme: ColorScheme): string {
  const declaration = new RegExp(`--th-color-${token.replaceAll('.', '-')}:\\s*#([0-9a-f]{6});`);
  const hex =
    (scheme === 'dark' && darkCss.match(declaration)?.[1]) || lightCss.match(declaration)?.[1];
  if (!hex) throw new Error(`No ${scheme} value for color.${token} in tokens.css`);
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

async function openHelloPage(page: Page, colorScheme: ColorScheme): Promise<void> {
  await page.emulateMedia({ colorScheme });
  await page.goto('/');
}

test.describe('E007 web theme', () => {
  test('AC5: hello page uses token colours and passes axe in light and dark', async ({
    page,
    messages: copy,
  }) => {
    const heading = page.getByRole('heading', { level: 1, name: copy.hello.title });
    const button = page.getByRole('button', { name: copy.hello.greet });
    const input = page.getByLabel(copy.hello.firstNameLabel);
    const colours: [Locator, string, string][] = [
      [page.locator('body'), 'background-color', 'bg.canvas'],
      [page.locator('body'), 'color', 'text.primary'],
      [page.locator('[data-slot="card"]'), 'background-color', 'bg.surface'],
      [heading, 'color', 'text.primary'],
      [page.getByText(copy.hello.description), 'color', 'text.secondary'],
      [input, 'border-top-color', 'border.control'],
      [button, 'background-color', 'action.primary.bg'],
      [button, 'color', 'action.primary.fg'],
    ];

    for (const scheme of colorSchemes) {
      await openHelloPage(page, scheme);
      for (const [element, property, token] of colours) {
        await expect(element, `${property} in ${scheme} mode`).toHaveCSS(
          property,
          tokenColour(token, scheme),
        );
      }
      await expectNoAxeViolations(page, `the hello page in ${scheme} mode`);
    }
  });
});
