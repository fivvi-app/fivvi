import { expect, expectNoAxeViolations, test } from './fixtures';

// #203. The axe check must not judge a page while a CSS transition or animation is still running:
// a disabled button that fades to full opacity (the hydration gate, #131) reads as low contrast
// halfway through. The check waits for the page to settle; it never sleeps.
test.describe('#203 axe waits for animations', () => {
  test('does not judge an element in the middle of a fade-in', async ({ page }) => {
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

  test('the sign-in button is judged at full opacity, not while it fades in', async ({
    page,
    messages: copy,
  }) => {
    // Chromium slows every animation to a twentieth of its speed, so the 150 ms fade of the
    // hydrated button (#131) lasts about three seconds instead of finishing before axe looks.
    const session = await page.context().newCDPSession(page);
    await session.send('Animation.enable');
    await session.send('Animation.setPlaybackRate', { playbackRate: 0.05 });

    await page.goto('/login');
    await expect(page.getByRole('button', { name: copy.signIn.sendCode })).toBeVisible();

    await expectNoAxeViolations(page, '/login while the button fades in');
  });
});
