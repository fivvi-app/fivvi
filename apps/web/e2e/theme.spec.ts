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

/** WCAG relative luminance of an sRGB colour with 0–255 channels. */
function luminance(r: number, g: number, b: number): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** The RGBA bytes of a PNG screenshot, decoded by the browser. */
async function pixels(page: Page, png: Buffer): Promise<{ width: number; data: number[] }> {
  return await page.evaluate(
    async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No 2D canvas context');
      context.drawImage(image, 0, 0);
      return {
        width: image.width,
        data: Array.from(context.getImageData(0, 0, image.width, image.height).data),
      };
    },
    `data:image/png;base64,${png.toString('base64')}`,
  );
}

/**
 * Asserts a visible focus indicator the way WCAG 2.4.13 measures one: the pixels that change
 * when the control gets keyboard focus change by at least 3:1 contrast, over an area at least
 * as large as a 2 CSS px thick perimeter of the control.
 */
async function expectVisibleFocusIndicator(page: Page, control: Locator, state: string) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const box = await control.boundingBox();
  if (!box) throw new Error(`${state}: the control is not visible`);
  const margin = 8;
  const clip = {
    x: box.x - margin,
    y: box.y - margin,
    width: box.width + 2 * margin,
    height: box.height + 2 * margin,
  };
  const shot = async () =>
    await pixels(page, await page.screenshot({ clip, animations: 'disabled', caret: 'hide' }));

  const unfocused = await shot();
  for (let presses = 0; presses < 20; presses++) {
    if (await control.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(control, `${state}: reachable with Tab`).toBeFocused();
  const focused = await shot();

  let changed = 0;
  for (let i = 0; i < unfocused.data.length; i += 4) {
    const [before, after] = [unfocused, focused].map(({ data }) =>
      luminance(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0),
    ) as [number, number];
    const ratio = (Math.max(before, after) + 0.05) / (Math.min(before, after) + 0.05);
    if (ratio >= 3) changed++;
  }
  const radius = Math.min(
    Number.parseFloat(
      await control.evaluate((element) => getComputedStyle(element).borderTopLeftRadius),
    ),
    Math.min(box.width, box.height) / 2,
  );
  const perimeter = 2 * (box.width + box.height) - (8 - 2 * Math.PI) * radius;
  const scale = unfocused.width / clip.width;
  expect(changed, `${state}: pixels changed by at least 3:1 on focus`).toBeGreaterThanOrEqual(
    2 * perimeter * scale * scale,
  );
}

async function openHelloPage(page: Page, colorScheme: ColorScheme): Promise<void> {
  await page.emulateMedia({ colorScheme });
  await page.goto('/');
}

/** A mode-independent token (`size.control.compact`) as written in tokens.css (`36px`). */
function tokenValue(token: string): string {
  const declaration = new RegExp(`--th-${token.replaceAll('.', '-')}:\\s*([^;]+);`);
  const value = lightCss.match(declaration)?.[1];
  if (!value) throw new Error(`No value for ${token} in tokens.css`);
  return value.trim();
}

/** A font stack token (`font.family.display`) as the browser computes it. */
async function tokenFontStack(page: Page, token: string): Promise<string> {
  return await page.evaluate((stack) => {
    const probe = document.createElement('span');
    probe.style.fontFamily = stack;
    document.body.append(probe);
    const computed = getComputedStyle(probe).fontFamily;
    probe.remove();
    return computed;
  }, tokenValue(token));
}

/** The families in a computed font-family, without quotes. */
const families = (fontFamily: string) =>
  fontFamily.split(',').map((family) => family.trim().replaceAll(/["']/g, ''));

type Density = 'compact' | 'touch';

/** Per density: its body type and control height tokens, and the values AC6 asks of them. */
const densities: Record<
  Density,
  { body: string; control: string; bodyPx: number; controlPx: { min: number; max: number } }
> = {
  compact: {
    body: 'density.compact.body',
    control: 'size.control.compact',
    bodyPx: 14,
    controlPx: { min: 36, max: 36 },
  },
  touch: {
    body: 'density.touch.body',
    control: 'size.control.touch',
    bodyPx: 16,
    controlPx: { min: 44, max: Number.POSITIVE_INFINITY },
  },
};

test.describe('E007 web theme', () => {
  test('AC5: hello page uses token colours and passes axe in light and dark', async ({
    page,
    messages: copy,
  }) => {
    const heading = page.getByRole('heading', { level: 1, name: copy.hello.title });
    const button = page.getByRole('button', { name: copy.hello.continue });
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

  test('AC7: focus indicator is visible on Button and Input', async ({ page, messages: copy }) => {
    const controls: [string, Locator][] = [
      ['Input', page.getByLabel(copy.hello.firstNameLabel)],
      ['Button', page.getByRole('button', { name: copy.hello.continue })],
    ];

    for (const scheme of colorSchemes) {
      await openHelloPage(page, scheme);
      for (const [name, control] of controls) {
        await expectVisibleFocusIndicator(page, control, `${name} in ${scheme} mode`);
      }
    }
  });

  test('AC6: compact and touch densities set body size and control height from tokens', async ({
    page,
    messages: copy,
  }) => {
    const controls: [string, Locator][] = [
      ['Input', page.getByLabel(copy.hello.firstNameLabel)],
      ['Button', page.getByRole('button', { name: copy.hello.continue })],
    ];
    // The root layout opts every page into touch density. Trainer Web layouts (M2) opt into
    // compact on a nested element; here the hello page's <main> stands in for one.
    const layouts: [Density, Locator][] = [
      ['touch', page.locator('body')],
      ['compact', page.locator('main')],
    ];

    await openHelloPage(page, 'light');
    await expect(page.locator('body')).toHaveAttribute('data-density', 'touch');
    for (const [density, layout] of layouts) {
      const { body, control, bodyPx, controlPx } = densities[density];
      await layout.evaluate(
        (element, value) => element.setAttribute('data-density', value),
        density,
      );

      const bodySize = tokenValue(`${body}.font-size`);
      expect(bodySize, `${body} is the AC6 body size`).toBe(`${bodyPx}px`);
      await expect(layout, `${density} body size`).toHaveCSS('font-size', bodySize);
      await expect(layout, `${density} body line height`).toHaveCSS(
        'line-height',
        tokenValue(`${body}.line-height`),
      );

      const controlHeight = Number.parseFloat(tokenValue(control));
      expect(controlHeight, `${control} meets AC6`).toBeGreaterThanOrEqual(controlPx.min);
      expect(controlHeight, `${control} meets AC6`).toBeLessThanOrEqual(controlPx.max);
      for (const [name, element] of controls) {
        // Retried: the Button transitions to its new size.
        await expect(element, `${name} height in ${density} density`).toHaveCSS(
          'height',
          `${controlHeight}px`,
        );
      }
    }
  });

  test('AC9: display heading uses the self-hosted font; no request leaves the origin for fonts', async ({
    page,
    messages: copy,
  }) => {
    const fontRequests: string[] = [];
    page.on('request', (request) => {
      if (['font', 'stylesheet'].includes(request.resourceType())) fontRequests.push(request.url());
    });

    await openHelloPage(page, 'light');
    const heading = page.getByRole('heading', { level: 1, name: copy.hello.title });
    /** Families of the page's @font-face rules that have loaded, without quotes. */
    const loadedFaces = async () =>
      await page.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts]
          .filter((font) => font.status === 'loaded')
          .map((font) => font.family.replaceAll(/["']/g, ''));
      });

    // The display stack: the self-hosted face first, ending in the system font.
    const display = await tokenFontStack(page, 'font.family.display');
    await expect(heading, 'the heading has the display style').toHaveCSS('font-family', display);
    const [face = ''] = families(display);
    expect(face, 'the display face').toBe('Bricolage Grotesque');
    await expect.poll(loadedFaces, { message: 'the display face is loaded' }).toContain(face);

    // Body text: the token's system stack, none of it a web font.
    const body = page.locator('body');
    await expect(body).toHaveCSS('font-family', await tokenFontStack(page, 'font.family.text'));
    const loaded = await loadedFaces();
    expect(
      families(await body.evaluate((node) => getComputedStyle(node).fontFamily)).filter((family) =>
        loaded.includes(family),
      ),
      'web fonts in the body text',
    ).toEqual([]);

    const origin = new URL(page.url()).origin;
    expect(
      fontRequests.filter((url) => new URL(url).pathname.endsWith('.woff2')),
      'the display face is served by the app',
    ).not.toEqual([]);
    expect(
      fontRequests.filter((url) => new URL(url).origin !== origin),
      'font and stylesheet requests to another origin',
    ).toEqual([]);
  });
});
