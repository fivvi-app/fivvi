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

    await expect(expectNoAxeViolations(page, 'a page that keeps animating')).rejects.toThrow(
      /did not settle.*p#restarting.*fade-in/,
    );
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
    await expect(page.getByRole('button', { name: copy.signIn.sendCode })).toBeVisible();

    await expectNoAxeViolations(page, '/login while the button fades in');
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
