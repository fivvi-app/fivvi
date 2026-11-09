import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Locator, Page } from '@playwright/test';
import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  newAddress,
  newAllowedAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';

type ColorScheme = 'light' | 'dark';
const colorSchemes: ColorScheme[] = ['light', 'dark'];

// The expected colours come from the generated token CSS, light on `:root` and dark in the
// `prefers-color-scheme: dark` block, so the test follows a token change without edits.
const tokensCss = readFileSync(
  createRequire(import.meta.url).resolve('@fivvi/design-tokens/tokens.css'),
  'utf8',
);
const [lightCss = '', darkCss = ''] = tokensCss.split('@media (prefers-color-scheme: dark)');

/** The value tokens.css declares for a token (`color.bg.canvas`) in one of its blocks. */
function declaredValue(css: string, token: string): string | undefined {
  return css.match(new RegExp(`--th-${token.replaceAll('.', '-')}:\\s*([^;]+);`))?.[1]?.trim();
}

/** A semantic colour token (`bg.canvas`) as the browser computes it (`rgb(246, 246, 247)`). */
function tokenColour(token: string, scheme: ColorScheme): string {
  const value =
    (scheme === 'dark' && declaredValue(darkCss, `color.${token}`)) ||
    declaredValue(lightCss, `color.${token}`);
  const hex = value?.match(/^#([0-9a-f]{6})$/)?.[1];
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

/**
 * The sign-in page: the app's one public page with a card, a field and a button in the trainer theme
 * (the hello page, which these tests used until F064 gave `/` to the website, had the same).
 */
async function openSignInPage(page: Page, colorScheme: ColorScheme): Promise<void> {
  await page.emulateMedia({ colorScheme });
  await page.goto('/login');
}

/** A mode-independent token (`size.control.compact`) as written in tokens.css (`36px`). */
function tokenValue(token: string): string {
  const value = declaredValue(lightCss, token);
  if (!value) throw new Error(`No value for ${token} in tokens.css`);
  return value;
}

/** A font stack token (`font.family.text`) as the browser computes it. */
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
  test('AC5: sign-in page uses token colours and passes axe in light and dark', async ({
    page,
    messages: copy,
  }) => {
    const heading = page.getByRole('heading', { level: 1, name: copy.signIn.title });
    const button = page.getByRole('button', { name: copy.signIn.sendCode });
    const input = page.getByLabel(copy.signIn.emailLabel);

    for (const scheme of colorSchemes) {
      await openSignInPage(page, scheme);
      // What a card's description is made of (`CardDescription`): small, muted text.
      const description = await probe(page, 'text-sm text-muted-foreground', 'Anna');
      const colours: [Locator, string, string][] = [
        [page.locator('body'), 'background-color', 'web.trainer.background'],
        [page.locator('body'), 'color', 'web.trainer.foreground'],
        [page.locator('[data-slot="card"]'), 'background-color', 'web.trainer.card'],
        [heading, 'color', 'web.trainer.foreground'],
        [description, 'color', 'web.trainer.muted-foreground'],
        [input, 'border-top-color', 'border.control'],
        [button, 'background-color', 'action.primary.bg'],
        [button, 'color', 'action.primary.fg'],
      ];
      for (const [element, property, token] of colours) {
        await expect(element, `${property} in ${scheme} mode`).toHaveCSS(
          property,
          tokenColour(token, scheme),
        );
      }
      await expectNoAxeViolations(page, `the sign-in page in ${scheme} mode`);
    }
  });

  test('AC7: focus indicator is visible on Button and Input', async ({ page, messages: copy }) => {
    const controls: [string, Locator][] = [
      ['Input', page.getByLabel(copy.signIn.emailLabel)],
      ['Button', page.getByRole('button', { name: copy.signIn.sendCode })],
    ];

    for (const scheme of colorSchemes) {
      await openSignInPage(page, scheme);
      // The button waits for the page to hydrate, and a disabled one takes no focus.
      await expect(controls[1]?.[1] as Locator).toBeEnabled();
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
      ['Input', page.getByLabel(copy.signIn.emailLabel)],
      ['Button', page.getByRole('button', { name: copy.signIn.sendCode })],
    ];
    // The root layout opts every page into touch density. Trainer Web layouts (M2) opt into
    // compact on a nested element; here the sign-in page's <main> stands in for one.
    const layouts: [Density, Locator][] = [
      ['touch', page.locator('body')],
      ['compact', page.locator('main')],
    ];

    await page.goto('/login');
    await expect(page.locator('body')).toHaveAttribute('data-density', 'touch');
    // Body text inside a Card, which sets its own (shadcn) body size.
    const bodyText = await probeIn(page, '[data-slot="card"]', 'Anna');
    for (const [density, layout] of layouts) {
      const { body, control, bodyPx, controlPx } = densities[density];
      await layout.evaluate(
        (element, value) => element.setAttribute('data-density', value),
        density,
      );

      const bodySize = tokenValue(`${body}.font-size`);
      expect(bodySize, `${body} is the AC6 body size`).toBe(`${bodyPx}px`);
      const bodyLineHeight = tokenValue(`${body}.line-height`);
      for (const [name, element] of [
        ['layout', layout],
        ['body text', bodyText],
      ] as const) {
        await expect(element, `${density} ${name} size`).toHaveCSS('font-size', bodySize);
        await expect(element, `${density} ${name} line height`).toHaveCSS(
          'line-height',
          bodyLineHeight,
        );
      }

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

  test('AC12: no web font is loaded and no font request leaves the page; text uses the system stack', async ({
    page,
    messages: copy,
  }) => {
    const fontRequests: string[] = [];
    page.on('request', (request) => {
      if (['font', 'stylesheet'].includes(request.resourceType())) fontRequests.push(request.url());
    });

    await openSignInPage(page, 'light');
    const heading = page.getByRole('heading', { level: 1, name: copy.signIn.title });
    /** Families of the page's @font-face rules that have loaded, without quotes. */
    const loadedFaces = async () =>
      await page.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts]
          .filter((font) => font.status === 'loaded')
          .map((font) => font.family.replaceAll(/["']/g, ''));
      });

    // Headings and body text take the token's system stack; none of it is a web font.
    const text = await tokenFontStack(page, 'font.family.text');
    await expect(page.locator('body')).toHaveCSS('font-family', text);
    await expect(heading).toHaveCSS('font-family', text);
    expect(await loadedFaces(), 'web fonts loaded').toEqual([]);

    // The only font or stylesheet requests are the app's own stylesheets, none to another origin.
    const origin = new URL(page.url()).origin;
    expect(
      fontRequests.filter((url) => new URL(url).pathname.match(/\.(woff2?|ttf|otf)$/)),
      'font files requested',
    ).toEqual([]);
    expect(
      fontRequests.filter((url) => new URL(url).origin !== origin),
      'font and stylesheet requests to another origin',
    ).toEqual([]);
  });
});

test.describe('E020 web theme', () => {
  test('AC11: numbers use the rounded face with tabular digits', async ({ page }) => {
    await openSignInPage(page, 'light');
    // `numeric` is what the kit's blocks put on times and counts.
    const number = await probe(page, 'numeric', '09:30');

    const rounded = await tokenFontStack(page, 'font.family.numeric');
    expect(rounded, 'the numeric stack starts with ui-rounded').toMatch(/^ui-rounded,/);
    await expect(number).toHaveCSS('font-family', rounded);
    await expect(number).toHaveCSS('font-variant-numeric', 'tabular-nums');
    // Text stays on the system stack.
    await expect(page.locator('body')).toHaveCSS(
      'font-family',
      await tokenFontStack(page, 'font.family.text'),
    );
  });

  test('AC13: trainer web is zinc, the client layout is the grouped grey canvas, radius 26 and glass', async ({
    page,
  }) => {
    for (const scheme of colorSchemes) {
      await openSignInPage(page, scheme);
      const body = page.locator('body');
      const card = await probe(page, 'rounded-card bg-card', 'Anna');
      const glass = await probe(page, 'glass', 'Fivvi');

      // The trainer web: zinc neutrals, radius 12, the card at radius 26 only where asked.
      await expect(body, `trainer background in ${scheme} mode`).toHaveCSS(
        'background-color',
        tokenColour('web.trainer.background', scheme),
      );
      expect(await variable(body, '--radius'), 'trainer radius').toBe(tokenValue('radius.md'));
      expect(
        await variable(body, '--muted-foreground'),
        `trainer secondary in ${scheme} mode`,
      ).toBe(schemeValue('color.web.trainer.muted-foreground', scheme));
      await expect(card).toHaveCSS('border-radius', tokenValue('radius.card'));
      await expectNoAxeViolations(page, `the trainer theme in ${scheme} mode`);

      // The client layout opts in with data-theme="client" (the kit's ClientLayout does).
      await body.evaluate((element) => element.setAttribute('data-theme', 'client'));
      await expect(body, `client canvas in ${scheme} mode`).toHaveCSS(
        'background-color',
        tokenColour('bg.canvas', scheme),
      );
      await expect(body).toHaveCSS('color', tokenColour('text.primary', scheme));
      expect(await variable(body, '--radius'), 'client radius').toBe(tokenValue('radius.card'));
      expect(await variable(body, '--muted-foreground'), `client secondary in ${scheme} mode`).toBe(
        schemeValue('color.web.client.secondary', scheme),
      );
      await expect(card).toHaveCSS('background-color', tokenColour('bg.surface', scheme));
      await expect(card).toHaveCSS('border-radius', tokenValue('radius.card'));

      // Glass: the glass token's fill, blurred.
      await expect(glass).toHaveCSS('background-color', schemeValue('color.web.glass-bg', scheme));
      await expect(glass).toHaveCSS('backdrop-filter', /^blur\(/);
      await expectNoAxeViolations(page, `the client theme in ${scheme} mode`);
    }
  });

  test('F064: the website is the client theme on its own body, from tokens, in light and dark', async ({
    page,
  }) => {
    for (const scheme of colorSchemes) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of ['/', '/en']) {
        await page.goto(path);
        const body = page.locator('body');

        await expect(body).toHaveAttribute('data-theme', 'client');
        await expect(body).toHaveAttribute('data-density', 'touch');
        await expect(body, `canvas in ${scheme} mode`).toHaveCSS(
          'background-color',
          tokenColour('bg.canvas', scheme),
        );
        await expect(body).toHaveCSS('color', tokenColour('text.primary', scheme));
        await expect(page.getByRole('banner'), `glass header in ${scheme} mode`).toHaveCSS(
          'background-color',
          schemeValue('color.web.glass-bg', scheme),
        );
        // The system stack, no web font.
        await expect(body).toHaveCSS('font-family', await tokenFontStack(page, 'font.family.text'));
      }
    }
  });

  test('AC14: the focus ring of a row in an inset list is drawn inside the clipped list', async ({
    page,
  }) => {
    await openSignInPage(page, 'light');
    await page.evaluate(() => {
      const list = document.createElement('ul');
      list.dataset.slot = 'inset-list';
      list.className = 'overflow-hidden rounded-card';
      list.innerHTML = '<li><button id="probe-row" type="button">Anna</button></li>';
      document.body.prepend(list);
    });
    await page.keyboard.press('Tab');
    const row = page.locator('#probe-row');

    await expect(row).toBeFocused();
    await expect(row).toHaveCSS('outline-offset', '-2px');
    await expect(row).toHaveCSS('outline-style', 'solid');
  });
});

/** The value a colour token declares for a mode, as written in tokens.css (`#6c6c70`, `rgba(…)`). */
function schemeValue(token: string, scheme: ColorScheme): string {
  const value =
    (scheme === 'dark' && declaredValue(darkCss, token)) || declaredValue(lightCss, token);
  if (!value) throw new Error(`No ${scheme} value for ${token} in tokens.css`);
  return value;
}

/** A custom property as the browser computes it on an element. */
async function variable(element: Locator, name: string): Promise<string> {
  return await element.evaluate(
    (node, property) => getComputedStyle(node).getPropertyValue(property).trim(),
    name,
  );
}

/** Appends a `<p>` to the first element matching `parent`, to read the text size it inherits. */
async function probeIn(page: Page, parent: string, text: string): Promise<Locator> {
  await page.evaluate(
    ([selector, content]) => {
      const element = document.createElement('p');
      element.id = 'probe-inherited';
      element.textContent = content as string;
      document.querySelector(selector as string)?.append(element);
    },
    [parent, text],
  );
  return page.locator('#probe-inherited');
}

/** Appends a `<div>` with the classes to the page, to read what they compute to. */
async function probe(page: Page, classes: string, text: string): Promise<Locator> {
  const id = `probe-${classes.replaceAll(/\W+/g, '-')}`;
  await page.evaluate(
    ([className, content, probeId]) => {
      const element = document.createElement('div');
      element.id = probeId as string;
      element.className = className as string;
      element.textContent = content as string;
      document.body.append(element);
    },
    [classes, text, id],
  );
  return page.locator(`#${id}`);
}

// E020 #626: the shell of the trainer web, as the prototype draws it (docs/design/prototype-v2,
// *Inloggen (TW-10)*, *Dashboard (WC-01)*, the sidebar): the gate pages and the sidebar sit on the
// sidebar fill, the section the person is on is marked, the workspace has its logo square.
test.describe('E020 trainer web shell', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  test('AC15: the sign-in, no access and welcome pages sit on the sidebar fill, in light and dark', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    for (const scheme of colorSchemes) {
      await openSignInPage(page, scheme);
      await expect(page.locator('main'), `sign-in in ${scheme}`).toHaveCSS(
        'background-color',
        tokenColour('web.trainer.sidebar', scheme),
      );
      // The card keeps the card colour on it, with the title centred under the mark.
      await expect(page.locator('[data-slot="card"]')).toHaveCSS(
        'background-color',
        tokenColour('web.trainer.card', scheme),
      );
      await expect(page.getByRole('heading', { level: 1, name: copy.signIn.title })).toHaveCSS(
        'text-align',
        'center',
      );
    }

    const outsider = newAddress('outsider');
    await createAccount(outsider);
    await signInWithSession(context, outsider);
    for (const scheme of colorSchemes) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/home');
      await expect(
        page.getByRole('heading', { level: 1, name: copy.noAccess.title }),
      ).toBeVisible();
      await expect(page.locator('main'), `no access in ${scheme}`).toHaveCSS(
        'background-color',
        tokenColour('web.trainer.sidebar', scheme),
      );
      await expectNoAxeViolations(page, `no access in ${scheme} and ${appLocale}`);
    }

    const newcomer = newAllowedAddress('newcomer');
    await createAccount(newcomer);
    await signInWithSession(context, newcomer);
    for (const scheme of colorSchemes) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/welcome');
      await expect(page.getByRole('heading', { level: 1, name: copy.welcome.title })).toBeVisible();
      await expect(page.locator('main'), `welcome in ${scheme}`).toHaveCSS(
        'background-color',
        tokenColour('web.trainer.sidebar', scheme),
      );
      await expectNoAxeViolations(page, `welcome in ${scheme} and ${appLocale}`);
      // A field that was refused turns red with the message under it, announced (the kit's Field).
      await page.getByRole('button', { name: copy.welcome.submit }).click();
      await expect(
        page.getByRole('alert').filter({ hasText: copy.welcome.errors.workspaceNameRequired }),
      ).toBeVisible();
      await expect(page.getByLabel(copy.welcome.workspaceNameLabel)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await expectNoAxeViolations(page, `welcome with an error in ${scheme} and ${appLocale}`);
    }
  });

  test('AC15: the sidebar is the sidebar fill, marks the section the person is on and shows the workspace logo and name', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const john = newAddress('john');
    await createAccount(john, undefined, 'John');
    const slug = await createGymWithTrainer(john, "John's Gym", 'owner');
    await signInWithSession(context, john);

    for (const scheme of colorSchemes) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/w/${slug}/trainers`);
      const sidebar = page.getByRole('complementary');
      await expect(sidebar, `sidebar in ${scheme}`).toHaveCSS(
        'background-color',
        tokenColour('web.trainer.sidebar', scheme),
      );
      // The logo square: the first letters of the name on the accent.
      const logo = sidebar.locator('[aria-hidden="true"]').filter({ hasText: 'JG' });
      await expect(logo).toHaveCSS('background-color', tokenColour('action.primary.bg', scheme));
      await expect(logo).toHaveCSS('color', tokenColour('action.primary.fg', scheme));

      // The current section has the muted row, dark text and its icon in the accent text.
      const nav = page.getByRole('navigation', { name: copy.workspaceNav.label });
      const current = nav.getByRole('link', { name: copy.workspaceNav.trainers });
      await expect(current).toHaveAttribute('aria-current', 'page');
      await expect(current).toHaveCSS('background-color', tokenColour('web.trainer.muted', scheme));
      await expect(current).toHaveCSS('color', tokenColour('web.trainer.foreground', scheme));
      await expect(current.locator('svg')).toHaveCSS('color', tokenColour('accent.text', scheme));
      const other = nav.getByRole('link', { name: copy.workspaceNav.settings, exact: true });
      await expect(other).not.toHaveAttribute('aria-current', /.+/);
      await expect(other).toHaveCSS('color', tokenColour('web.trainer.muted-foreground', scheme));
      await expectNoAxeViolations(page, `the sidebar in ${scheme} and ${appLocale}`);
    }
  });

  test('AC15: the workspace dashboard (WC-01) is a page with the workspace name, in light and dark', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const john = newAddress('john');
    await createAccount(john, undefined, 'John');
    const slug = await createGymWithTrainer(john, "John's Gym", 'owner');
    await signInWithSession(context, john);

    for (const scheme of colorSchemes) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/w/${slug}`);
      await expect(page.getByRole('heading', { level: 1, name: "John's Gym" })).toBeVisible();
      await expect(page.getByText(copy.workspaceHome.description)).toBeVisible();
      // The bar over the page is 60px high, as the prototype's `.w-top`.
      const bar = page
        .getByRole('button', { name: copy.workspaceNav.new, exact: true })
        .locator('xpath=ancestor::div[contains(@class, "border-b")][1]');
      expect((await bar.boundingBox())?.height).toBe(60);
      await expect(page.locator('[data-slot="card"]')).toHaveCSS(
        'background-color',
        tokenColour('web.trainer.card', scheme),
      );
      await expectNoAxeViolations(page, `the dashboard in ${scheme} and ${appLocale}`);
    }
  });
});
