// Browser behaviour checks for the no-build prototype. Run with Playwright available
// in NODE_PATH or the workspace: node --test docs/design/prototype/smoke.test.cjs
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { chromium } = require('playwright');

const url = pathToFileURL(resolve(__dirname, 'index.html')).href;
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

test('prototype-only Dutch and English keys remain in parity', () => {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(resolve(__dirname, 'strings.js'), 'utf8'), context);
  const { nl, en } = context.window.PROTO_STRINGS;
  assert.deepEqual(Object.keys(nl).sort(), Object.keys(en).sort());
});

test('all six flow links open without a script error', async () => {
  for (let flow = 1; flow <= 6; flow++) {
    const { page, errors } = await pageFor(flow);
    assert.ok(await page.locator('#app button').count() > 0, `flow ${flow} has controls`);
    assert.deepEqual(errors, [], `flow ${flow} script errors`);
    await page.close();
  }
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
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.ok(await page.locator('[data-act="b-pick"][data-id="o-og25"]').isVisible());
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
  assert.ok(await calendar.page.locator('.week-day').count() === 7);
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

test('workout logger records three sets and difficulty on the last set', async () => {
  const { page, errors } = await pageFor(5);
  await page.locator('[data-act="log-step"][data-k="w"][data-v="1"]').click();
  for (let i = 0; i < 3; i++) await page.locator('[data-act="log-save"]').click();
  await page.locator('[data-act="log-diff"][data-v="hard"]').click();
  await page.locator('[data-act="log-ex"][data-v="1"]').click();
  await page.locator('[data-act="log-ex"][data-v="1"]').click();
  await page.locator('[data-act="log-ex"][data-v="1"]').click();
  assert.ok((await page.locator('.list').textContent()).includes('Set 3'));
  await page.locator('#log-note').fill('Volgende keer zelfde gewicht.');
  await page.locator('[data-act="log-done"]').click();
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
