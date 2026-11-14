import { expect, expectNoAxeViolations, test } from './fixtures';

// #203. The axe check must not judge a page while a CSS transition or animation is still running:
// a disabled button that fades to full opacity (the hydration gate, #131) reads as low contrast
// halfway through. The check waits for the page to settle; it never sleeps.
test.describe('F001 axe check waits for animations (#203)', () => {
  test('AC1: does not judge an element in the middle of a fade-in', async ({ page }) => {
    // Dark text that is clear at full opacity and faint (about 1.4:1) when the fade starts.
    await page.setContent(`<!doctype html>
      <html lang="en">
        <head>
          <title>Fade</title>
          <style>
            @keyframes fade-in { from { opacity: 0.05; } to { opacity: 1; } }
            p { color: #000; background: #fff; animation: fade-in 600ms linear; }
          </style>
        </head>
        <body><main><p>Settles to full contrast</p></main></body>
      </html>`);

    await expectNoAxeViolations(page, 'a page that fades in');
  });

  test('AC1: does not wait for a CSS animation that is paused', async ({ page }) => {
    await page.setContent(`<!doctype html>
      <html lang="en">
        <head>
          <title>Paused</title>
          <style>
            @keyframes fade-in { from { opacity: 1; } to { opacity: 1; } }
            p { color: #000; background: #fff; animation: fade-in 600ms linear paused; }
          </style>
        </head>
        <body><main><p>Paused for good</p></main></body>
      </html>`);

    await expectNoAxeViolations(page, 'a page with a paused animation');
  });

  test('AC1: does not wait for a Web Animation that is paused', async ({ page }) => {
    await page.setContent(`<!doctype html>
      <html lang="en">
        <head><title>Paused</title></head>
        <body><main><p style="color: #000; background: #fff">Paused for good</p></main></body>
      </html>`);
    await page.evaluate(() => {
      const paragraph = document.querySelector('p');
      const animation = paragraph?.animate([{ opacity: 1 }, { opacity: 1 }], 600);
      animation?.pause();
    });

    await expectNoAxeViolations(page, 'a page with a paused Web Animation');
  });

  test('AC1: names the animation that keeps restarting instead of hanging', async ({ page }) => {
    // A finite animation that starts over every 150 ms is never done, so the page never settles.
    await page.setContent(`<!doctype html>
      <html lang="en">
        <head>
          <title>Restarting</title>
          <style>
            @keyframes fade-in { from { opacity: 0.05; } to { opacity: 1; } }
            p { color: #000; background: #fff; animation: fade-in 600ms linear; }
          </style>
        </head>
        <body>
          <main><p id="restarting">Never settles</p></main>
          <script>
            const paragraph = document.getElementById('restarting');
            setInterval(() => {
              paragraph.style.animation = 'none';
              void paragraph.offsetWidth;
              paragraph.style.animation = '';
            }, 150);
          </script>
        </body>
      </html>`);

    await expect(
      expectNoAxeViolations(page, 'a page that keeps animating', { settleTimeoutMs: 500 }),
    ).rejects.toThrow(/did not settle within 500 ms.*p#restarting.*fade-in/);
  });

  test('AC2: the sign-in button is judged at full opacity, not while it fades in', async ({
    browserName,
    page,
    messages: copy,
  }) => {
    test.skip(browserName !== 'chromium', 'The slow-down uses the Chrome DevTools Protocol.');

    // The test slows every animation to a twentieth of its speed over CDP, so the 150 ms fade of
    // the hydrated button (#131) lasts about three seconds instead of finishing before axe looks.
    const session = await page.context().newCDPSession(page);
    await session.send('Animation.enable');
    await session.send('Animation.setPlaybackRate', { playbackRate: 0.05 });

    await page.goto('/login');
    // Enabled, not just visible: the server-rendered button is disabled and axe skips it.
    await expect(page.getByRole('button', { name: copy.signIn.sendCode })).toBeEnabled();

    await expectNoAxeViolations(page, '/login while the button fades in');
  });

  // #287. Axe can read a control the moment its transition starts, before the frame that
  // announces the transition (`transitionrun`) has come: the page was busy hydrating. The check
  // must not trust "nothing started" then; it also looks at what is running when axe is done.
  test('#287: reruns when a transition began during the run and its event has not come yet', async ({
    page,
  }) => {
    // The page holds back `transitionrun`, as a frame that has not been drawn yet would, and
    // starts a fade-in on the first style read after the check arms it (that is axe's, not the
    // settle wait's). No frame passes before axe reads the start of the fade: about 1.4:1. The
    // fade is long enough to still run when a loaded machine has axe done (#1386).
    await page.setContent(`<!doctype html>
      <html lang="en">
        <head>
          <title>Late fade</title>
          <style>
            button { color: #000; background: #fff; opacity: 0.05; transition: opacity 3s linear; }
            button.on { opacity: 1; }
          </style>
        </head>
        <body>
          <main><button type="button">Hydrated late</button></main>
          <script>
            document.addEventListener('transitionrun', (event) => event.stopImmediatePropagation(), true);
            const read = window.getComputedStyle.bind(window);
            let started = false;
            window.getComputedStyle = (...args) => {
              if (window.__armed && !started) {
                started = true;
                document.querySelector('button').classList.add('on');
              }
              return read(...args);
            };
          </script>
        </body>
      </html>`);
    await page.evaluate(() => {
      (window as Window & { __armed?: boolean }).__armed = true;
    });

    await expectNoAxeViolations(page, 'a fade whose event has not come');
  });

  // #1386. A fade can start in the moment between the end of the wait and the first look at what
  // is animating: its `transitionrun` has come by then, and the fade is running, so `before`
  // already holds both. Axe reads the page in the middle of it, and when the fade is over by the
  // time axe is done, "nothing started and nothing runs" is true and the read would be trusted.
  test('#1386: reruns when a fade was already running when axe began, and is over when it is done', async ({
    page,
  }) => {
    // The page plays the sequence by counting the check's looks at `document.getAnimations()`:
    // the first (the end of the wait) finds nothing and starts a fade, with the event the frame
    // would bring; the third (after axe) finds the fade finished. 8 s of linear fade keeps the
    // opacity near 0.05 (about 1.4:1) for as long as axe reads.
    await page.setContent(`<!doctype html>
      <html lang="en">
        <head>
          <title>Fade begun between the wait and the first look</title>
          <style>
            button { color: #000; background: #fff; opacity: 0.05; transition: opacity 8s linear; }
            button.on { opacity: 1; }
          </style>
        </head>
        <body>
          <main><button type="button">Hydrated just now</button></main>
          <script>
            const getAnimations = Document.prototype.getAnimations;
            let looks = 0;
            Document.prototype.getAnimations = function (...args) {
              looks += 1;
              if (looks === 1) {
                const found = getAnimations.apply(this, args);
                document.querySelector('button').classList.add('on');
                document.dispatchEvent(new Event('transitionrun'));
                return found;
              }
              if (looks === 3) {
                for (const animation of getAnimations.apply(this, args)) animation.finish();
              }
              return getAnimations.apply(this, args);
            };
          </script>
        </body>
      </html>`);

    await expectNoAxeViolations(page, 'a fade begun between the wait and the first look');
  });

  test('AC3: still fails on a real contrast problem, also while a fade is running', async ({
    page,
  }) => {
    // #bbb on white is about 1.9:1 at full opacity: no fade makes that pass.
    await page.setContent(`<!doctype html>
      <html lang="en">
        <head>
          <title>Low contrast</title>
          <style>
            @keyframes fade-in { from { opacity: 0.05; } to { opacity: 1; } }
            p { color: #bbb; background: #fff; animation: fade-in 300ms linear; }
          </style>
        </head>
        <body><main><p>Hard to read</p></main></body>
      </html>`);

    await expect(expectNoAxeViolations(page, 'a low-contrast page')).rejects.toThrow(
      /color-contrast/,
    );
  });
});
