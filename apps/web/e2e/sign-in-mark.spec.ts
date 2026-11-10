import { expect, expectNoAxeViolations, test } from './fixtures';

// E020 #626, the mark of the trainer web's sign-in (TW-10, owner, 9 November 2026): the wordmark
// at 768 px and wider (Tailwind's `md`, where the workspace sidebar goes beside the content), the
// plain day dial below that. Never both, never the placeholder "F", named "Fivvi", in light and
// dark. The files are the brand files of docs/design/brand, served from public/site-images/brand.
const marks = [
  { width: 767, kind: 'day dial', light: '/fivvi-day-dial.svg', dark: '/fivvi-day-dial-dark.svg' },
  { width: 768, kind: 'wordmark', light: '/fivvi-logo.svg', dark: '/fivvi-logo-dark.svg' },
] as const;

test.describe('E020 sign-in mark', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (const { width, kind, ...files } of marks) {
      test(`AC: at ${width} px wide in ${scheme} mode the sign-in shows the ${kind} and nothing else`, async ({
        page,
        appLocale,
        messages: copy,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto('/login');
        await expect(
          page.getByRole('heading', { level: 1, name: copy.signIn.title }),
        ).toBeVisible();

        // One mark, named "Fivvi": not two marks with one hidden by the stylesheet, and not a letter.
        const mark = page.getByRole('img', { name: copy.app.title });
        await expect(mark).toHaveCount(1);
        await expect(mark).toBeVisible();
        await expect(page.getByText('F', { exact: true })).toHaveCount(0);
        await expect
          .poll(() =>
            mark.evaluate((image: HTMLImageElement) => new URL(image.currentSrc).pathname),
          )
          .toMatch(new RegExp(`/site-images/brand${files[scheme].replace('.', '\\.')}$`));
        // The file loaded and has a size on the page.
        await expect
          .poll(() => mark.evaluate((image: HTMLImageElement) => image.naturalWidth))
          .toBeGreaterThan(0);
        const box = await mark.boundingBox();
        expect(box?.height).toBeGreaterThan(24);
        if (kind === 'wordmark') expect(box?.width).toBeGreaterThan(box?.height ?? 0);
        else expect(box?.width).toBeCloseTo(box?.height ?? 0, 0);

        await expectNoAxeViolations(
          page,
          `the sign-in at ${width} px in ${scheme} and ${appLocale}`,
        );
      });
    }
  }
});
