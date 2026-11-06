#!/usr/bin/env node
/*
 * Captures the real screens of the clickable prototype for the website design:
 * every shot in Dutch and English, light and dark, with transparent corners.
 *
 *   node docs/design/website/capture.cjs [shot-id ...]
 *
 * Writes PNGs to the folder in $CAPTURE_OUT (default: assets/shots-png next to this file).
 * Convert them with cwebp afterwards. Fictional data only.
 */
const path = require('path');
const fs = require('fs');
const here = __dirname;
const root = path.resolve(here, '../../..');
const { chromium } = require(path.join(root, 'apps/web/node_modules/@playwright/test'));
const out = process.env.CAPTURE_OUT || path.join(here, 'assets/shots-png');
fs.mkdirSync(out, { recursive: true });

/* id, panel entry (group,index), platform, business setup */
const SHOTS = [
  // Fivvi Pro
  ['pro-today-gym', '0,6', 'ios', 'team'],
  ['pro-today-solo', '0,2', 'ios', 'solo'],
  ['pro-today-pilates', '0,1', 'ios', 'pilates'],
  ['pro-today-yoga', '0,1', 'ios', 'yoga'],
  ['pro-today-android', '0,1', 'android', 'team'],
  ['pro-client', '0,22', 'ios', 'team'],
  ['pro-session', '0,10', 'ios', 'team'],
  ['pro-duo', '0,11', 'ios', 'team'],
  ['pro-log', '0,25', 'ios', 'team'],
  ['pro-share', '0,28', 'ios', 'team'],
  // Fivvi, the client app
  ['app-home', '2,4', 'ios', 'team'],
  ['app-book', '2,5', 'ios', 'team', 'busiest-day'],
  ['app-confirm', '2,5', 'ios', 'team', 'confirm-booking'],
  ['app-credit', '2,10', 'ios', 'team'],
  ['app-studios', '2,14', 'ios', 'team'],
  ['app-renew', '2,27', 'ios', 'team'],
  ['app-self', '2,35', 'ios', 'team'],
  ['app-android', '2,4', 'android', 'team'],
  // Client web
  ['cw-timetable', '3,3', 'ios', 'team', 'busiest-day'],
  ['cw-waitlist', '3,6', 'ios', 'team'],
  ['cw-waitlist-pilates', '3,6', 'ios', 'pilates'],
  ['cw-waitlist-yoga', '3,6', 'ios', 'yoga'],
  ['pro-class-pilates', '0,1', 'ios', 'pilates', 'open-class'],
  ['pro-class-yoga', '0,1', 'ios', 'yoga', 'open-class'],
  ['web-class-pilates', '1,9', 'web', 'pilates'],
  ['web-class-yoga', '1,9', 'web', 'yoga'],
  ['web-join-pilates', '1,12', 'web', 'pilates'],
  ['web-join-yoga', '1,12', 'web', 'yoga'],
  // Trainer web
  ['web-dashboard', '1,0', 'web', 'team'],
  ['web-agenda', '1,3', 'web', 'team'],
  ['web-client', '1,7', 'web', 'team'],
  ['web-class', '1,9', 'web', 'team'],
  ['web-trainers', '1,11', 'web', 'team'],
  ['web-offers', '1,13', 'web', 'team'],
  ['web-payments', '1,21', 'web', 'team'],
];

/* The public site never shows a real company's name, so the fictional data gets neutral places. */
const NEUTRAL = [['TrainMore Zuid', 'Sportzaal Zuid'], ['TrainMore', 'Sportzaal'], ['Basic-Fit Oost', 'Gym Oost'], ['Basic-Fit', 'Gym Oost']];

(async () => {
  const only = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1800, height: 1100 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.join(root, 'docs/design/prototype-v2/index.html'));
  await page.addStyleTag({ content: `
    *,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
    html,body,.board,.stage,.mk{background:transparent!important}
    .dev,.dev.android,.dev.web{box-shadow:none!important}
    .mobile-fab{display:none!important}
  ` });
  const pref = (k, v) => page.click(`#panel [data-pref="${k}"][data-v="${v}"]`);

  /* The client timetable opens on today, which has no classes left: go to the fullest day. */
  const bookButtons = () => page.locator('#dev button:not([data-a="c-atab"])').filter({ hasText: /^\s*(Boeken|Book)\s*$/ });
  const steps = {
    'busiest-day': async () => {
      const days = page.locator('#dev [data-a="c-day"]');
      let best = 0, most = -1;
      for (let i = 0; i < await days.count(); i++) {
        await page.locator('#dev [data-a="c-day"]').nth(i).click();
        const n = await bookButtons().count();
        if (n > most) { most = n; best = i; }
      }
      await page.locator('#dev [data-a="c-day"]').nth(best).click();
      await page.waitForTimeout(150);
    },
    'open-class': async () => {
      await page.locator('#dev').getByText(/^(Reformer Classic|Vinyasa Flow)/).first().click();
      await page.waitForTimeout(200);
    },
    'confirm-booking': async () => {
      await steps['busiest-day']();
      await bookButtons().first().click();
      await page.waitForTimeout(200);
    },
  };

  for (const lang of ['nl', 'en']) {
    await pref('lang', lang);
    for (const mode of ['light', 'dark']) {
      await pref('mode', mode);
      for (const [id, go, plat, setup, step] of SHOTS) {
        if (only.length && !only.includes(id)) continue;
        await page.click('#panel [data-reset]');
        await pref('setup', setup);
        await pref('plat', plat === 'web' ? 'ios' : plat);
        await page.click(`#panel [data-go="${go}"]`);
        await page.waitForTimeout(250);
        if (step) await steps[step]();
        await page.evaluate(async (neutral) => {
          await document.fonts.ready;
          const walker = document.createTreeWalker(document.getElementById('dev'), NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            let t = walker.currentNode.nodeValue;
            for (const [a, b] of neutral) t = t.split(a).join(b);
            walker.currentNode.nodeValue = t;
          }
        }, NEUTRAL);
        await page.locator('#dev').screenshot({ path: path.join(out, `${id}-${lang}-${mode}.png`), omitBackground: true });
      }
    }
  }
  await browser.close();
  if (errors.length) { console.error('script errors:', [...new Set(errors)]); process.exit(1); }
  console.log('done', fs.readdirSync(out).length, 'files');
})();
