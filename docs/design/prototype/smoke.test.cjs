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

test('prototype-only Dutch and English keys remain in parity', () => {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(resolve(__dirname, 'strings.js'), 'utf8'), context);
  const { nl, en } = context.window.PROTO_STRINGS;
  assert.deepEqual(Object.keys(nl).sort(), Object.keys(en).sort());
});

test('all seven flow links open without a script error', async () => {
  for (let flow = 1; flow <= 7; flow++) {
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
  await page.locator('.day-chip[data-v="2026-09-25"]').click();
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
