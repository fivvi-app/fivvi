// Browser behaviour checks for the no-build prototype. Run with Playwright available
// in NODE_PATH or the workspace: node --test docs/design/prototype/smoke.test.cjs
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { chromium } = require('playwright');

const url = process.env.PROTO_URL || pathToFileURL(resolve(__dirname, 'index.html')).href;
let browser;
async function pageFor(flow, viewport = { width: 390, height: 844 }) {
  browser ||= await chromium.launch(process.env.CHROME_BIN
    ? { executablePath: process.env.CHROME_BIN, headless: true }
    : { channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url + (flow ? `#flow${flow}` : ''));
  return { page, errors };
}
after(async () => { await browser?.close(); });

// Count words actually painted in the viewport, excluding clipped/offscreen text,
// closed disclosures and text covered by nav, sheets or the prototype toolbar.
async function viewportWords(page, selector) {
  return page.locator(selector).evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node, count = 0;
    while ((node = walker.nextNode())) {
      for (const match of node.textContent.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        if ([...range.getClientRects()].some((rect) => {
          const x = (rect.left + rect.right) / 2, y = (rect.top + rect.bottom) / 2;
          const hit = document.elementFromPoint(x, y);
          return rect.width > 0 && x >= 0 && x < innerWidth && y >= 0 && y < innerHeight
            && hit && node.parentElement.contains(hit);
        })) count++;
      }
    }
    return count;
  });
}

test('Today prioritises next client and action with at least 25% fewer viewport words', async () => {
  for (const lang of ['nl', 'en']) {
    const { page, errors } = await pageFor(2);
    await page.locator(`[data-act="set-lang"][data-v="${lang}"]`).first().click();
    for (const platform of ['ios', 'android']) {
      await page.locator(`[data-act="set-platform"][data-v="${platform}"]`).click();
      assert.ok(await viewportWords(page, '.app') <= 44, `${lang}/${platform} exceeds Today word budget (baseline NL iOS: 59)`);
      assert.ok(await page.locator('.next [data-act="start-log"]').isVisible());
      assert.ok(await page.locator('.next [data-act="open-session"][data-id="p-mark"]').isVisible());
      assert.ok(await page.locator('[data-act="open-session"][data-id="p-koen"]').isVisible());
      assert.ok(await page.locator('[data-act="open-occ"][data-id="o-str22"]').isVisible());
      await page.locator('.next [data-act="open-session"]').click();
      assert.ok((await content(page)).includes('Sarah Personal Training'), 'workspace remains reachable');
      assert.ok((await content(page)).includes('Basic-Fit Oost'), 'location remains reachable');
      await page.locator('[data-act="back"]').first().click();
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('platforms arrange Today differently: inset iOS groups vs Material dashboard and elevated agenda cards', async () => {
  const { page } = await pageFor(2);
  await page.locator('[data-act="set-platform"][data-v="ios"]').click();
  assert.ok(await page.locator('.nav--ios .nav-large-title').isVisible());
  assert.equal(await page.locator('main .day-overview').count(), 0);
  const iosRow = await page.locator('.agenda-list .session-row').first().evaluate((el) => ({
    radius: getComputedStyle(el).borderRadius,
    shadow: getComputedStyle(el).boxShadow,
  }));
  assert.equal(await page.locator('.fab').count(), 0);
  await page.locator('[data-act="set-platform"][data-v="android"]').click();
  assert.ok(await page.locator('.nav--md .nav-bar h1').isVisible());
  assert.ok(await page.locator('main .day-overview').isVisible(), 'day overview moves into Material content');
  const androidRow = await page.locator('.agenda-list .session-row').first().evaluate((el) => ({
    radius: getComputedStyle(el).borderRadius,
    shadow: getComputedStyle(el).boxShadow,
  }));
  assert.notDeepEqual(androidRow, iosRow, 'agenda cards differ structurally, not just type');
  assert.ok(await page.locator('.fab').isVisible());
  const activeIcon = page.locator('.tab[aria-current="page"] .tab-ico');
  assert.notEqual(await activeIcon.evaluate((el) => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  await page.locator('.next [data-act="open-session"]').click();
  assert.ok(await page.locator('[data-act="start-log"]').isVisible(), 'same capability on Android');
  await page.close();
});

test('hub presents seven compact visual flow tiles, with instructions deliberately disclosed', async () => {
  for (const lang of ['nl', 'en']) {
    const { page, errors } = await pageFor(null);
    await page.locator(`[data-act="set-lang"][data-v="${lang}"]`).click();
    assert.equal(await page.locator('.flow-card').count(), 7);
    assert.equal(await page.locator('.flow-card .icon-badge').count(), 7);
    const fourth = await page.locator('.flow-entry').nth(3).boundingBox();
    assert.ok(fourth.y + fourth.height <= 844, 'at least four flow entry points fit above the fold');
    assert.ok(await viewportWords(page, '.hub') <= 80, 'hub viewport word budget (baseline NL: 142)');
    const painted = await page.locator('.hub').innerText();
    assert.ok(painted.trim().split(/\s+/).length <= 180, 'whole hub is concise, not just pushed below viewport');
    assert.ok(await page.locator('.flow-card').last().isVisible());
    await page.locator('.hub-guide summary').click();
    assert.ok(await page.locator('.hub-guide .disclosure-body').isVisible());
    await page.locator('.hub-guide summary').click();
    await startFlow(page, '4move');
    assert.ok(await page.locator('[data-act="panel-move"]').isVisible(), 'alternate entry points remain one click away');
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('flow tiles keep a visible 2px keyboard focus ring inside their clipped cards in both appearances', async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const { page, errors } = await pageFor(null, viewport);
    for (const theme of ['light', 'dark']) {
      await page.locator(`[data-act="set-theme"][data-v="${theme}"]`).click();
      const entries = page.locator('.flow-entry');
      assert.equal(await entries.count(), 7);
      for (const entry of await entries.all()) {
        await entry.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        const ring = await entry.evaluate((el) => {
          const style = getComputedStyle(el), cardStyle = getComputedStyle(el.parentElement);
          const rect = el.getBoundingClientRect(), card = el.parentElement.getBoundingClientRect();
          const width = parseFloat(style.outlineWidth), offset = parseFloat(style.outlineOffset);
          return {
            focused: el.matches(':focus-visible'),
            width, style: style.outlineStyle, color: style.outlineColor,
            background: cardStyle.backgroundColor, overflow: cardStyle.overflow,
            // An outline outside the card's padding box is clipped, even when
            // :focus-visible matches and the computed outline is nonzero.
            contained: rect.left - offset - width >= card.left + parseFloat(cardStyle.borderLeftWidth)
              && rect.top - offset - width >= card.top + parseFloat(cardStyle.borderTopWidth)
              && rect.right + offset + width <= card.right - parseFloat(cardStyle.borderRightWidth)
              && rect.bottom + offset + width <= card.bottom - parseFloat(cardStyle.borderBottomWidth),
          };
        });
        const label = `${viewport.width}px/${theme}/${await entry.getAttribute('data-v')}`;
        assert.ok(ring.focused, `${label} receives keyboard focus`);
        assert.equal(ring.width, 2, `${label} has a 2px focus ring`);
        assert.equal(ring.style, 'solid');
        assert.notEqual(ring.color, 'rgba(0, 0, 0, 0)');
        assert.notEqual(ring.color, ring.background, `${label} ring contrasts with the card`);
        assert.equal(ring.overflow, 'hidden', 'rounded card clipping is preserved');
        assert.ok(ring.contained, `${label} focus ring must be inside the card's clipping bounds`);
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('appearance starts light on a dark OS; explicit changes keep booking drafts and workout sets', async () => {
  const { page, errors } = await pageFor(1);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  const palette = () => page.evaluate(() => ({
    canvas: getComputedStyle(document.body).backgroundColor,
    scheme: getComputedStyle(document.documentElement).colorScheme,
  }));
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  const light = await palette();
  assert.equal(light.scheme, 'light');
  await page.locator('[data-act="b-pick"][data-id="o-str22"]').click();
  await page.locator('#b-name').fill('Demo Guest');
  await page.locator('#b-email').fill('demo@example.com');
  await page.locator('.appearance summary').click();
  await page.locator('[data-act="set-theme"][data-v="dark"]').click();
  assert.notEqual((await palette()).canvas, light.canvas);
  assert.equal((await palette()).scheme, 'dark');
  assert.equal(await page.locator('#b-name').inputValue(), 'Demo Guest');
  assert.equal(await page.locator('#b-email').inputValue(), 'demo@example.com');
  await page.locator('[data-act="set-theme"][data-v="light"]').click();
  assert.deepEqual(await palette(), light);
  await page.locator('[data-form="booking"] button[type="submit"]').click();
  assert.ok(await page.locator('[data-countdown]').isVisible());
  await page.locator('[data-act="home"]').click();
  await startFlow(page, '5');
  await page.locator('[data-act="log-open"][data-v="0"]').first().click();
  await page.locator('[data-act="log-check"][data-v="0"]').click();
  await page.locator('.appearance summary').click();
  await page.locator('[data-act="set-theme"][data-v="dark"]').click();
  assert.equal(await page.locator('[data-act="log-check"][data-v="0"]').getAttribute('aria-pressed'), 'true');
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light', 'appearance is not silently persisted');
  assert.deepEqual(errors, []);
  await page.close();
});

for (const screen of ['session disclosures', 'workout results']) {
  test(`appearance preserves deep scroll and expanded ${screen} in both directions`, async () => {
    for (const lang of ['nl', 'en']) {
      for (const platform of ['ios', 'android']) {
        const { page, errors } = await pageFor(screen === 'session disclosures' ? 2 : null, { width: 390, height: 540 });
        await page.locator(`[data-act="set-lang"][data-v="${lang}"]`).first().click();
        await page.locator(`[data-act="set-platform"][data-v="${platform}"]`).click();
        if (screen === 'session disclosures') {
          await page.locator('.next [data-act="open-session"]').click();
        } else {
          await startFlow(page, '5');
          await page.locator('[data-act="log-open"][data-v="0"]').first().click();
          await page.locator('[data-act="log-check"][data-v="0"]').click();
          await page.locator('[data-act="back"]').click();
          await page.locator('.nav [data-act="log-finish"]').click();
          await page.locator('#internal-note').fill('Synthetic unsaved trainer note');
        }
        const scroll = page.locator('main[data-scroll]');
        const collapsedMax = await scroll.evaluate((el) => el.scrollHeight - el.clientHeight);
        const disclosures = page.locator(screen === 'session disclosures' ? '.session-info, .session-notes' : '.workout-breakdown');
        for (const disclosure of await disclosures.all()) await disclosure.locator('summary').click();
        await page.locator('.appearance summary').click();
        for (const theme of ['dark', 'light']) {
          const before = await scroll.evaluate((el) => {
            el.scrollTop = el.scrollHeight;
            return { top: el.scrollTop, height: el.scrollHeight, content: el.innerText };
          });
          assert.ok(before.top > Math.max(0, collapsedMax) + 40,
            `${lang}/${platform}/${screen} scrolls beyond the collapsed content height`);
          await page.locator(`[data-act="set-theme"][data-v="${theme}"]`).click();
          assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
          assert.equal(await page.locator('html').getAttribute('lang'), lang);
          assert.deepEqual(await disclosures.evaluateAll((els) => els.map((el) => el.open)),
            screen === 'session disclosures' ? [true, true] : [true], 'disclosures stay expanded');
          const after = await scroll.evaluate((el) => ({ top: el.scrollTop, height: el.scrollHeight, content: el.innerText }));
          assert.equal(after.height, before.height, 'expanded content keeps its height');
          assert.equal(after.content, before.content, 'screen and workout results stay unchanged');
          assert.equal(after.top, before.top, `${lang}/${platform}/${theme} keeps the deep scroll position`);
          if (screen === 'workout results') {
            assert.equal(await page.locator('#internal-note').inputValue(), 'Synthetic unsaved trainer note');
            assert.deepEqual(await page.locator('.workout-metrics .metric-value').allTextContents(), ['1/3', '1']);
          }
        }
        assert.deepEqual(errors, []);
        await page.close();
      }
    }
  });
}

test('owner palette keeps large surfaces, primary actions and navigation monochrome, with colour only in small semantic markers', async () => {
  const { page, errors } = await pageFor(2);
  for (const platform of ['ios', 'android']) {
    await page.locator(`[data-act="set-platform"][data-v="${platform}"]`).click();
    for (const theme of ['light', 'dark']) {
      await page.locator('.appearance summary').click();
      await page.locator(`[data-act="set-theme"][data-v="${theme}"]`).click();
      await page.locator('.appearance summary').click();
      const styles = await page.locator('.app, .next, .next .btn--primary, .nav, .tab.is-active, .tab.is-active .tab-ico, .fab, .protobar')
        .evaluateAll((els) => els.flatMap((el) => ['backgroundColor', 'color'].map((property) => ({
          element: el.className, property, value: getComputedStyle(el)[property],
        }))));
      for (const style of styles) {
        const channels = style.value.match(/[\d.]+/g).slice(0, 3).map(Number);
        assert.ok(Math.max(...channels) - Math.min(...channels) <= 8,
          `${platform}/${theme} ${style.element} ${style.property} should be neutral: ${style.value}`);
      }
      const marker = await page.locator('.next .icon-badge--private').evaluate((el) => ({
        color: getComputedStyle(el).color, width: el.getBoundingClientRect().width,
      }));
      const channels = marker.color.match(/\d+/g).slice(0, 3).map(Number);
      assert.ok(Math.max(...channels) - Math.min(...channels) > 12, 'small private-session marker retains semantic colour');
      assert.ok(marker.width <= 40, 'colour stays in a small marker');
    }
  }
  await page.locator('[data-act="home"]').click();
  await startFlow(page, '1');
  const brand = await page.locator('.pub-mark').evaluate((el) => getComputedStyle(el).backgroundColor);
  const channels = brand.match(/\d+/g).slice(0, 3).map(Number);
  assert.ok(Math.max(...channels) - Math.min(...channels) <= 8, 'public brand block is monochrome too');
  assert.deepEqual(errors, []);
  await page.close();
});

test('prototype-only Dutch and English keys remain in parity', () => {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(resolve(__dirname, 'strings.js'), 'utf8'), context);
  const { nl, en } = context.window.PROTO_STRINGS;
  assert.deepEqual(Object.keys(nl).sort(), Object.keys(en).sort());
});

test('session and client details disclose secondary information without burying workout actions or note privacy', async () => {
  const { page, errors } = await pageFor(2);
  await page.locator('.next [data-act="open-session"]').click();
  assert.ok(await viewportWords(page, '.app') <= 55, 'session details have a concise first view');
  assert.ok(await page.locator('[data-act="start-log"]').isVisible());
  assert.equal(await page.locator('.session-notes').getAttribute('open'), null);
  assert.equal(await page.locator('.session-notes .note-text').first().isVisible(), false);
  await page.locator('.session-notes summary').click();
  assert.ok(await page.locator('.session-notes .note-text').first().isVisible());
  assert.ok(await page.locator('.session-notes .note-meta').first().isVisible(), 'trainer-only visibility travels with notes');
  await page.locator('[data-act="open-client"]').click();
  assert.ok(await page.locator('[data-act="c-train"]').isVisible());
  assert.equal(await page.locator('.client-contact').getAttribute('open'), null);
  await page.locator('.client-contact summary').click();
  assert.ok((await page.locator('.client-contact').innerText()).includes('mark@example.com'));
  assert.deepEqual(errors, []);
  await page.close();
});

test('all seven flow links open without a script error', async () => {
  for (let flow = 1; flow <= 7; flow++) {
    const { page, errors } = await pageFor(flow);
    assert.ok(await page.locator('#app button').count() > 0, `flow ${flow} has controls`);
    assert.deepEqual(errors, [], `flow ${flow} script errors`);
    await page.close();
  }
});

test('booking leads with the time and class, while privacy and capacity remain explicit', async () => {
  const { page, errors } = await pageFor(1);
  await page.locator('[data-act="b-pick"][data-id="o-str22"]').click();
  assert.ok(await page.locator('.booking-time').isVisible());
  assert.ok((await page.locator('.booking-time').innerText()).includes('18:00'));
  assert.equal(await page.locator('.summary-title').innerText(), 'Strength');
  assert.ok(await page.locator('.privacy').isVisible());
  assert.ok(await viewportWords(page, '.pub') <= 50, 'booking focuses on facts and two inputs');
  await page.locator('[data-act="back"]').click();
  await page.locator('.day-chip[data-v="2026-09-23"]').click();
  assert.ok(await page.locator('[data-act="b-pick"][data-id="o-boot23"]').isDisabled(), '12/12 Bootcamp still prevents booking');
  assert.deepEqual(errors, []);
  await page.close();
});

test('public booking verifies a class and keeps the EN toggle on Open Gym', async () => {
  const { page, errors } = await pageFor(1);
  await page.locator('[data-act="b-pick"][data-id="o-str22"]').click();
  await page.locator('#b-name').fill('Demo Guest');
  await page.locator('#b-email').fill('demo@example.com');
  await page.locator('[data-form="booking"] button[type="submit"]').click();
  assert.ok(await page.locator('[data-countdown]').isVisible());
  await page.locator('[data-act="b-open-mail"]').click();
  await page.locator('[data-act="b-mail-link"]').click();
  await page.locator('[data-act="b-confirm"]').click();
  assert.ok(await page.locator('[data-act="b-account"]').isVisible());
  await page.locator('[data-act="b-no-account"]').click();
  await page.locator('[data-act="b-restart"]').click();
  await page.locator('.pub-lang [data-act="set-lang"][data-v="en"]').click();
  await page.locator('[data-act="b-mode"][data-v="openGym"]').click();
  await page.locator('.day-chip[data-v="2026-09-25"]').click();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.ok(await page.locator('[data-act="b-pick"][data-id="o-og25"]').isVisible());
  assert.deepEqual(errors, []);
  await page.close();
});

test('workout finish leads with numeric results and keeps set breakdown reachable before sharing review', async () => {
  const { page, errors } = await pageFor(null);
  await startFlow(page, '5');
  await page.locator('[data-act="log-open"][data-v="0"]').first().click();
  await page.locator('[data-act="log-check"][data-v="0"]').click();
  await page.locator('[data-act="back"]').click();
  await page.locator('.nav [data-act="log-finish"]').click();
  assert.deepEqual(await page.locator('.workout-metrics .metric-value').allTextContents(), ['1/3', '1']);
  assert.equal(await page.locator('.workout-breakdown').getAttribute('open'), null);
  await page.locator('.workout-breakdown summary').click();
  assert.ok((await page.locator('.workout-breakdown').innerText()).includes('60 kg × 8'));
  assert.ok(await page.locator('#internal-note').isVisible());
  await page.locator('#internal-note').fill('Synthetic trainer-only note');
  await page.locator('[data-act="log-done"]').click();
  await page.locator('[data-act="share-review"]').click();
  assert.ok(!(await content(page)).includes('Synthetic trainer-only note'));
  assert.ok(await page.locator('[data-act="share-confirm"]').isVisible());
  assert.deepEqual(errors, []);
  await page.close();
});

test('app and web add menus use visual action tiles without repeating workspace explanations', async () => {
  const { page, errors } = await pageFor(null);
  await page.locator('[data-act="set-me"][data-v="john"]').click();
  await startFlow(page, '7');
  assert.equal(await page.locator('.sheet .create-grid .icon-badge').count(), 4);
  assert.ok(await viewportWords(page, '.sheet') <= 25);
  assert.ok((await page.locator('.sheet').innerText()).includes("John's Gym"));
  await page.locator('[data-act="sheet-close"]').first().click();
  await page.locator('[data-act="home"]').click();
  await startFlow(page, '3');
  await page.locator('[data-act="w-new"]').click();
  assert.equal(await page.locator('.panel .create-grid .icon-badge').count(), 4);
  await page.locator('[data-act="w-pick"][data-v="private"]').click();
  assert.ok(await page.locator('#web-client').isVisible());
  assert.deepEqual(errors, []);
  await page.close();
});

test('Today, calendar and mobile styles expose their critical data', async () => {
  const today = await pageFor(2);
  assert.ok(await today.page.locator('[data-act="open-session"][data-id="p-mark"]').count() > 0);
  await today.page.locator('[data-act="set-platform"][data-v="android"]').first().click();
  assert.equal(await today.page.locator('html').getAttribute('data-platform'), 'android');
  await today.page.locator('[data-act="open-session"][data-id="p-mark"]').first().click();
  assert.ok(await today.page.locator('.note').count() > 0);
  assert.deepEqual(today.errors, []);
  await today.page.close();

  const calendar = await pageFor(3, { width: 1280, height: 800 });
  await calendar.page.locator('[data-act="w-view"][data-v="week"]').click();
  assert.equal(await calendar.page.locator('.cal--week .cal-lane').count(), 7);
  await calendar.page.locator('[data-act="w-open"][data-id="o-str24"]').click();
  assert.ok(await calendar.page.locator('#panel-h').isVisible());
  assert.deepEqual(calendar.errors, []);
  await calendar.page.close();
});

test('owner web creates one private session and moves Mark home', async () => {
  const created = await pageFor(4, { width: 1280, height: 800 });
  assert.ok(await created.page.locator('#web-client').isVisible());
  await created.page.locator('#web-client').selectOption('mark');
  await created.page.locator('#np-time').fill('07:30');
  await created.page.locator('[data-act="loc-pick"][data-v="bfo"]').click();
  await created.page.locator('[data-form="new-session"] button[type="submit"]').click();
  assert.ok(await created.page.locator('#panel-h').isVisible());
  assert.ok((await created.page.locator('.panel-body').textContent()).includes('07:30'));
  assert.deepEqual(created.errors, []);
  await created.page.close();

  const moved = await pageFor(null, { width: 1280, height: 800 });
  await moved.page.locator('[data-act="flow"][data-v="4move"]').click();
  await moved.page.locator('[data-act="panel-move"]').click();
  await moved.page.locator('#mv-date').fill('2026-10-01');
  await moved.page.locator('#mv-time').fill('07:30');
  await moved.page.locator('[data-act="loc-pick"][data-v="home-mark"]').click();
  await moved.page.locator('[data-form="move"] button[type="submit"]').click();
  assert.ok((await moved.page.locator('.panel-body').textContent()).includes('07:30'));
  assert.ok((await moved.page.locator('.panel-body').textContent()).includes('Mark'));
  assert.deepEqual(moved.errors, []);
  await moved.page.close();
});

test('owner calendar creates a group class and Open Gym from the new menu', async () => {
  const { page, errors } = await pageFor(3, { width: 1280, height: 800 });
  await page.locator('[data-act="w-new"]').click();
  assert.ok(await page.locator('[data-act="w-pick"][data-v="private"]').isVisible());
  await page.locator('[data-act="w-pick"][data-v="group"]').click();
  await page.locator('#occ-title').fill('Strength Express');
  await page.locator('#occ-start').fill('13:00');
  await page.locator('#occ-end').fill('14:00');
  await page.locator('#occ-trainer').selectOption('sarah');
  await page.locator('[data-form="new-occurrence"] button[type="submit"]').click();
  assert.ok((await page.locator('#panel-h').textContent()).includes('Strength Express'));
  await page.locator('[data-act="w-close"]').last().click();
  await page.locator('[data-act="w-new"]').click();
  await page.locator('[data-act="w-pick"][data-v="openGym"]').click();
  await page.locator('#occ-start').fill('14:00');
  await page.locator('#occ-end').fill('15:00');
  await page.locator('[data-form="new-occurrence"] button[type="submit"]').click();
  assert.ok((await page.locator('.panel-body').textContent()).includes('Open Gym'));
  assert.deepEqual(errors, []);
  await page.close();
});

async function startFlow(page, id) {
  await page.locator(`[data-act="flow"][data-v="${id}"]`).click();
}
const content = (page) => page.locator('.content').textContent();

test('planned workout saves an internal note and shares only the client message and sets', async () => {
  const { page, errors } = await pageFor(null);
  await startFlow(page, '5');
  await page.locator('[data-act="log-open"][data-v="0"]').first().click();
  await page.locator('[data-act="log-step"][data-k="w"][data-v="1"]').click();
  for (let i = 0; i < 3; i++) await page.locator('[data-act="log-save"]').click();
  await page.locator('[data-act="log-diff"][data-v="hard"]').click();
  await page.locator('[data-act="back"]').click();
  await page.locator('.nav [data-act="log-finish"]').click();
  assert.ok((await content(page)).includes('Niet gedaan'));
  await page.locator('#internal-note').fill('PRIVATE: knee concern');
  await page.locator('[data-act="log-done"]').click();
  await page.locator('#client-note').fill('Great work, Mark. Keep the same weight.');
  await page.locator('[data-act="share-review"]').click();
  let body = await content(page);
  assert.ok(body.includes('Great work, Mark.'));
  assert.ok(body.includes('62,5 kg × 8 · 62,5 kg × 8 · 62,5 kg × 8'));
  assert.ok(!body.includes('PRIVATE: knee concern'));
  await page.locator('[data-act="share-confirm"]').click();
  await page.locator('[data-act="view-email"]').click();
  body = await page.locator('.pub').textContent();
  assert.ok(body.includes('Great work, Mark.'));
  assert.ok(body.includes('62.5 kg'));
  assert.ok(!body.includes('PRIVATE: knee concern'));
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.locator('[data-act="view-profile"]').click();
  body = await page.locator('.pub').textContent();
  assert.ok(body.includes('Great work, Mark.'));
  assert.ok(!body.includes('PRIVATE: knee concern'));
  assert.deepEqual(errors, []);
  await page.close();
});

test('workout can be saved privately and shared later', async () => {
  const { page, errors } = await pageFor(null);
  await startFlow(page, '5');
  await page.locator('[data-act="log-open"][data-v="0"]').first().click();
  await page.locator('[data-act="log-check"][data-v="0"]').click();
  await page.locator('[data-act="back"]').click();
  await page.locator('.nav [data-act="log-finish"]').click();
  await page.locator('#internal-note').fill('Trainer only');
  await page.locator('[data-act="log-done"]').click();
  await page.locator('[data-act="share-later"]').click();
  assert.ok((await content(page)).includes('Trainer only'));
  await page.locator('[data-act="open-share"]').click();
  await page.locator('[data-act="share-review"]').click();
  assert.ok(!(await content(page)).includes('Trainer only'));
  assert.deepEqual(errors, []);
  await page.close();
});

test('workout without a template: add library and custom exercises, one-tap sets, save as template', async () => {
  const { page, errors } = await pageFor(5);
  await page.locator('[data-act="log-begin"][data-v="empty"]').click();
  await page.locator('#ex-search').fill('bench');
  assert.equal(await page.locator('li[data-name]:visible').count(), 1);
  assert.ok(await page.locator('[data-new-ex]').isVisible());
  await page.locator('[data-act="log-add-ex"][data-v="bench"]').click();
  await page.locator('#step-w').fill('40');
  await page.locator('#step-w').dispatchEvent('change');
  await page.locator('[data-act="log-check"][data-v="0"]').click();
  assert.equal(await page.locator('[data-act="log-check"][data-v="0"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-act="log-add-set"]').click();
  assert.ok((await page.locator('.sets tbody tr').nth(1).textContent()).includes('40 kg × 10'));
  await page.locator('[data-act="back"]').click();
  await page.locator('[data-act="log-add"]').click();
  await page.locator('#ex-search').fill('Sled push');
  await page.locator('[data-act="log-new-ex"]').click();
  assert.ok((await page.locator('.log-ex').textContent()).includes('Sled push'));
  await page.locator('[data-act="log-check"][data-v="0"]').click();
  await page.locator('[data-act="back"]').click();
  assert.equal(await page.locator(".ex-list [data-act=\"log-open\"]").count(), 2);
  await page.locator('.nav [data-act="log-finish"]').click();
  await page.locator('[data-act="log-save-tpl"]').check();
  await page.locator('#tpl-name').fill('Koen kracht');
  await page.locator('[data-act="log-done"]').click();
  assert.ok((await page.locator('#toast').textContent()).includes('Koen kracht'));
  await page.locator('[data-act="home"]').click();
  await startFlow(page, '5free');
  const start = await content(page);
  assert.ok(start.includes('Koen kracht'));
  assert.ok(start.includes('Sled push') || start.includes('2 oefeningen'));
  assert.deepEqual(errors, []);
  await page.close();
});

test('repeat previous workout prefills last time\'s values', async () => {
  const { page, errors } = await pageFor(5);
  await page.locator('[data-act="log-begin"][data-v="repeat"]').click();
  assert.equal(await page.locator(".ex-list [data-act=\"log-open\"]").count(), 3);
  await page.locator('[data-act="log-open"][data-v="0"]').first().click();
  assert.ok((await page.locator('.sets tbody tr').first().textContent()).includes('20 kg × 12'));
  assert.deepEqual(errors, []);
  await page.close();
});

test('app + menu follows the role; owner creates a weekly class, Open Gym and a client', async () => {
  const { page, errors } = await pageFor(null);
  await page.locator('[data-act="set-me"][data-v="john"]').click();
  await startFlow(page, '7');
  assert.ok((await page.locator('.sheet').textContent()).includes("John's Gym"));
  await page.locator('[data-act="app-new"][data-v="group"]').click();
  await page.locator('#occ-title').fill('HIIT');
  await page.locator('#occ-repeat').selectOption('weekly');
  await page.locator('[data-form="new-occurrence"] button[type="submit"]').click();
  assert.ok((await page.locator('.nav').textContent()).includes('HIIT'));
  assert.ok((await page.locator('#toast').textContent()).includes('8'));
  await page.locator('[data-act="home"]').click();
  await startFlow(page, '7');
  await page.locator('[data-act="app-new"][data-v="openGym"]').click();
  await page.locator('[data-form="new-occurrence"] button[type="submit"]').click();
  assert.ok((await page.locator('.nav').textContent()).includes('Open Gym'));
  await page.locator('[data-act="home"]').click();
  await startFlow(page, '7');
  await page.locator('[data-act="app-new"][data-v="client"]').click();
  await page.locator('#cn-name').fill('Eva Janssen');
  await page.locator('#cn-email').fill('priya@example.com');
  await page.locator('[data-form="new-client"] button[type="submit"]').click();
  await page.locator('[data-act="cn-use"]').click();
  assert.ok((await page.locator('.nav').textContent()).includes('Priya Sharma'));
  await page.locator('[data-act="home"]').click();
  await page.locator('[data-act="set-me"][data-v="sarah"]').click();
  await startFlow(page, '7');
  assert.ok((await page.locator('.sheet').textContent()).includes('plant de eigenaar'));
  assert.deepEqual(errors, []);
  await page.close();
});

test('trainer adds a client while planning, and starts a workout from a client profile', async () => {
  const { page, errors } = await pageFor(null);
  await startFlow(page, '4app');
  await page.locator('#client-search').fill('Nina Vos');
  assert.ok((await page.locator('[data-new-client-label]').textContent()).includes('Nina Vos'));
  await page.locator('[data-act="np-new-client"]').click();
  assert.equal(await page.locator('#cn-name').inputValue(), 'Nina Vos');
  await page.locator('[data-form="new-client"] button[type="submit"]').click();
  assert.ok((await page.locator('.picked').textContent()).includes('Nina Vos'));
  await page.locator('[data-act="home"]').click();
  await startFlow(page, '7clients');
  assert.ok((await content(page)).includes('Nina Vos'));
  await page.locator('[data-act="open-client"]', { hasText: 'Mark Peters' }).click();
  await page.locator('[data-act="c-train"]').click();
  assert.ok(await page.locator('[data-act="log-begin"][data-v="empty"]').isVisible());
  assert.deepEqual(errors, []);
  await page.close();
});

test('owner web adds a client from + Nieuw and inline while creating a session', async () => {
  const { page, errors } = await pageFor(3, { width: 1280, height: 800 });
  await page.locator('[data-act="w-new"]').click();
  await page.locator('[data-act="w-pick"][data-v="client"]').click();
  await page.locator('#cn-name').fill('Walk-in Guest');
  await page.locator('[data-form="new-client"] button[type="submit"]').click();
  assert.ok((await page.locator('#toast').textContent()).includes('Walk-in'));
  await page.locator('[data-act="w-new"]').click();
  await page.locator('[data-act="w-pick"][data-v="private"]').click();
  await page.locator('[data-act="w-new-client"]').click();
  await page.locator('#cn-name').fill('Ruben de Wit');
  await page.locator('[data-form="new-client"] button[type="submit"]').click();
  assert.ok((await page.locator('#web-client option:checked').textContent()).includes('Ruben de Wit'));
  assert.deepEqual(errors, []);
  await page.close();
});

test('owner clicks an empty calendar slot and filters by trainer', async () => {
  const { page, errors } = await pageFor(3, { width: 1280, height: 800 });
  const lane = page.locator('.cal-lane[data-lane="mike"]');
  const box = await lane.boundingBox();
  await page.evaluate(() => { document.querySelector('.cal-scroll').scrollTop = 0; });
  const top = (await lane.boundingBox()).y;
  await page.mouse.click(box.x + 20, top + 48 * 8 + 10); // 06:00 + 8 h = 14:00
  assert.ok((await page.locator('.panel-body').textContent()).includes('14:00'));
  await page.locator('[data-act="w-pick"][data-v="group"]').click();
  assert.equal(await page.locator('#occ-start').inputValue(), '14:00');
  assert.equal(await page.locator('#occ-trainer').inputValue(), 'mike');
  await page.locator('[data-act="w-close"]').last().click();
  await page.locator('#w-trainer').selectOption('sarah');
  assert.equal(await page.locator('.cal-lane-head').count(), 1);
  assert.ok((await page.locator('.cal-lane-head').textContent()).includes('Sarah'));
  assert.deepEqual(errors, []);
  await page.close();
});

test('trainers and clients can look weeks ahead', async () => {
  const { page, errors } = await pageFor(2);
  await page.locator('[data-act="tab"][data-v="calendar"]').click();
  await page.locator('[data-act="ag-view"][data-v="month"]').click();
  assert.ok(await page.locator('.day-cell').count() >= 28);
  await page.locator('[data-act="ag-step"][data-v="1"]').click();
  await page.locator('[data-act="ag-day"][data-v="2026-10-13"]').click();
  assert.ok((await content(page)).includes('Mark Peters'));
  await page.locator('[data-act="home"]').click();
  await startFlow(page, '1');
  assert.equal(await page.locator('.day-chip').count(), 21);
  await page.locator('.day-chip[data-v="2026-10-08"]').click();
  assert.ok((await page.locator('.class-list').textContent()).includes('Strength'));
  assert.deepEqual(errors, []);
  await page.close();
});

test('deep links follow hash changes; narrow hub and iOS toolbar stay in place', async () => {
  const { page, errors } = await pageFor(null, { width: 340, height: 740 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 340));
  await page.evaluate(() => { location.hash = '#flow3'; });
  await page.locator('.web-top').waitFor();
  await page.evaluate(() => { location.hash = '#flow2'; });
  await page.locator('[data-act="set-platform"][data-v="ios"]').first().click();
  assert.equal(await page.locator('.nav-trail [data-act="app-new-menu"]').count(), 1);
  assert.ok(!(await content(page)).includes("John's Gym · John's Gym"));
  assert.deepEqual(errors, []);
  await page.close();
});

test('owner substitutes and cancels one class; app records attendance', async () => {
  const owner = await pageFor(6, { width: 1280, height: 800 });
  await owner.page.locator('[data-act="open-sub"]').click();
  assert.ok(await owner.page.locator('[data-act="sub-pick"][data-v="john"]').isDisabled());
  await owner.page.locator('[data-act="sub-pick"][data-v="mike"]').click();
  await owner.page.locator('[data-act="sub-confirm"]').click();
  assert.ok((await owner.page.locator('.panel-body').textContent()).includes('Mike'));
  await owner.page.locator('[data-act="w-close"]').last().click();
  await owner.page.locator('[data-act="w-step"][data-v="1"]').click();
  await owner.page.locator('[data-act="w-step"][data-v="1"]').click();
  await owner.page.locator('[data-act="w-open"][data-id="o-str24"]').click();
  await owner.page.locator('[data-act="open-cancel"]').click();
  await owner.page.locator('[data-act="cancel-confirm"]').click();
  assert.ok(await owner.page.locator('.banner--danger').isVisible());
  assert.deepEqual(owner.errors, []);
  await owner.page.close();

  const app = await pageFor(null);
  await app.page.locator('[data-act="flow"][data-v="6app"]').click();
  await app.page.locator('[data-act="att"][data-v="attended"]').first().click();
  await app.page.locator('[data-act="att"][data-v="noShow"]').last().click();
  assert.equal(await app.page.locator('[data-act="att"][aria-pressed="true"]').count(), 2);
  assert.deepEqual(app.errors, []);
  await app.page.close();
});

test('owner web fills a phone screen; the class panel shows full names and details', async () => {
  const phone = await pageFor(3);
  const mainWidth = await phone.page.locator('.web-main').evaluate((el) => el.getBoundingClientRect().width);
  assert.ok(mainWidth >= 380, `owner calendar main column is ${mainWidth}px on a 390px phone`);
  await phone.page.locator('[data-act="w-view"][data-v="week"]').click();
  assert.ok((await phone.page.locator('.web-main').textContent()).includes('21–27 september'));
  assert.deepEqual(phone.errors, []);
  await phone.page.close();

  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const { page, errors } = await pageFor(6, viewport);
    const firstList = page.locator('.panel-body > .list').first();
    const clipped = await firstList.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    assert.ok(!clipped, `class details are clipped at ${viewport.width}px`);
    const name = page.locator('.att-row .row-title').first();
    assert.equal(await name.evaluate((el) => el.getClientRects().length), 1, `attendee name wraps at ${viewport.width}px`);
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('all surfaces fit narrow, short, landscape and desktop screens; forms and large logger controls remain reachable', async () => {
  for (const viewport of [
    { width: 340, height: 740 }, { width: 390, height: 540 },
    { width: 844, height: 390 }, { width: 1280, height: 800 },
  ]) {
    const { page, errors } = await pageFor(null, viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const platform of ['ios', 'android']) {
      await page.locator(`[data-act="set-platform"][data-v="${platform}"]`).first().click();
      for (const flow of ['2', '4app', '5', '7', '1', '3', '6']) {
        await startFlow(page, flow);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${platform}/${flow} body overflow at ${viewport.width}×${viewport.height}`);
        if (flow === '4app') {
          await page.locator('[data-act="np-client"][data-v="mark"]').click();
          await page.locator('#np-date').fill('2026-09-30');
          assert.equal(await page.locator('#np-date').inputValue(), '2026-09-30');
          await page.locator('[data-act="loc-pick"][data-v="bfo"]').click();
          await page.locator('[data-form="new-session"] button[type="submit"]').click();
          assert.ok(await page.locator('[data-act="start-log"]').isVisible());
        }
        if (flow === '5') {
          await page.locator('[data-act="log-open"][data-v="0"]').first().click();
          const scroll = page.locator('.app > .scroll');
          assert.ok(await scroll.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'logger table is not horizontally clipped');
          assert.ok((await scroll.boundingBox()).height >= 100, 'logger values get usable scroll space, even in landscape');
          const controls = page.locator('[data-act="log-step"], [data-act="log-save"]');
          for (const box of await controls.evaluateAll((els) => els.map((el) => {
            const b = el.getBoundingClientRect(); return { w: b.width, h: b.height, bottom: b.bottom };
          }))) {
            assert.ok(box.w >= 44 && box.h >= 64 && box.bottom <= viewport.height, 'large logger controls stay onscreen');
          }
          await page.locator('[data-act="log-check"][data-v="0"]').click();
          assert.equal(await page.locator('[data-act="log-check"][data-v="0"]').getAttribute('aria-pressed'), 'true');
        }
        if (flow === '7') {
          const body = page.locator('.sheet-body');
          assert.ok(await body.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'sheet content is not clipped horizontally');
          await page.locator('[data-act="app-new"][data-v="client"]').click();
          await page.locator('#cn-name').fill('Demo Landscape Client');
          await page.locator('[data-form="new-client"] button[type="submit"]').click();
          assert.ok((await page.locator('.app').innerText()).includes('Demo Landscape Client'));
        }
        if (flow === '1') {
          await page.locator('[data-act="b-pick"][data-id="o-str22"]').click();
          await page.locator('#b-name').fill('Demo Guest');
          await page.locator('#b-email').fill('demo@example.com');
          await page.locator('[data-form="booking"] button[type="submit"]').click();
          assert.ok(await page.locator('[data-countdown]').isVisible());
        }
        await page.locator('[data-act="home"]').click();
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
});
