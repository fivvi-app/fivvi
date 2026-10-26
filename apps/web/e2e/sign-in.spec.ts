import { formattingLocales, type Messages } from '@fivvi/i18n';
import type { Page } from '@playwright/test';
import {
  clientIpHeaders,
  createAccount,
  newAddress,
  newAllowedAddress,
  sessionExpiries,
  setSessionExpiry,
} from './accounts';
import { emailsTo, signInCode, signInLink, waitForEmail, waitForEmails } from './brevo';
import { expect, expectNoAxeViolations, test } from './fixtures';

// F001, TW-10 `/login`: the email step, then the code step on the same screen. Copy comes from
// the catalogs. The emails go to the fake Brevo server (e2e/fake-brevo.ts), which the specs read
// the code from; every spec has an address of its own.
const REQUESTED_QUERY = 'from=bookmark';

test.describe('F001 sign in on TW-10', () => {
  // Sign-in requests are limited per IP address (20 an hour) and per email address (3 in 15
  // minutes), and every browser here comes from the same IP address. An `x-real-ip` of its own
  // gives each spec its own limit, like separate visitors (`clientIpHeaders` in accounts.ts); each
  // spec also uses a new email address.
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  test('AC2: signs in with the code and returns to the requested page', async ({
    page,
    appLocale,
    messages: copy,
  }) => {
    const address = newAddress('owner');
    await createAccount(address);

    // An anonymous visitor asks for a page (a bookmark, with a query string) and lands on the
    // sign-in page, which remembers it (AC13).
    await page.goto(`/home?${REQUESTED_QUERY}`);
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fhome%3F/);
    await expect(page.getByRole('heading', { level: 1, name: copy.signIn.title })).toBeVisible();
    await expectNoAxeViolations(page, `the email step in ${appLocale}`);

    await page.getByLabel(copy.signIn.emailLabel).fill(address);
    await page.getByRole('button', { name: copy.signIn.sendCode }).click();

    // The code step, on the same screen. It says nothing about whether the address has an account.
    await expect(
      page.getByRole('heading', { level: 1, name: copy.signIn.checkEmailTitle }),
    ).toBeVisible();
    await expect(
      page.getByText(copy.signIn.checkEmailBody.replace('{email}', address)),
    ).toBeVisible();
    // The label is the word alone; the sentence is helper text the field is described by.
    await expect(page.getByLabel(copy.signIn.codeLabel)).toHaveAccessibleDescription(
      copy.signIn.codeHelp,
    );
    await expectNoAxeViolations(page, `the code step in ${appLocale}`);

    // Exactly one EM-08 per request, in the language of the page (the account has no stored one).
    const email = await waitForEmail(address);
    expect(await emailsTo(address)).toHaveLength(1);
    expect(email.subject).toBe(copy.email.signIn.subject);
    // The same email carries the sign-in link, which is the confirm step of this site (#136).
    expect(new URL(signInLink(email)).pathname).toBe('/login/confirm');

    await page.getByLabel(copy.signIn.codeLabel).fill(signInCode(email));
    await page.getByRole('button', { name: copy.signIn.submitCode }).click();

    // The page that was asked for, not just the signed-in home (a placeholder until F002 adds
    // workspaces): the same path and query string.
    await expect(page).toHaveURL(new RegExp(`/home\\?${REQUESTED_QUERY}$`));
    await expect(page.getByRole('heading', { level: 1, name: copy.home.title })).toBeVisible();
    await expect(page).toHaveTitle(copy.home.title);

    // The data path: the sign-in session cookie this browser holds belongs to the account.
    const session = await page.request.get('/api/auth/get-session');
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe(address);
    expect(await emailsTo(address)).toHaveLength(1);
  });

  test('AC13: a trainer-web page needs sign-in; public pages and foreign return addresses', async ({
    page,
    request,
    baseURL,
    appLocale,
    messages: copy,
  }) => {
    // A trainer-web page, the signed-in home: an anonymous visitor goes to /login, which keeps the page.
    await page.goto('/home');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fhome$/);
    await expect(page.getByRole('heading', { level: 1, name: copy.signIn.title })).toBeVisible();
    // Every path is guarded unless it is public, also one that nothing serves yet, so a new page
    // is never open by accident and a 404 does not show who is signed in.
    await page.goto('/w/pilot-gym/calendar?view=week');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fw%2Fpilot-gym%2Fcalendar%3Fview%3Dweek$/);

    // The public pages and routes need no sign-in: the sign-in page, the hello page, the health
    // check and the hello route.
    await page.goto('/');
    await expect(page).toHaveURL(`${baseURL}/`);
    await expect(page.getByRole('heading', { level: 1, name: copy.hello.title })).toBeVisible();
    expect((await request.get('/api/v1/health')).status()).toBe(200);
    expect((await request.get(`/api/v1/hello?locale=${appLocale}`)).status()).toBe(200);
    // The public booking pages are not built yet (F037+); the guard leaves their paths open: the
    // answer is the 404 page, not a redirect to sign-in.
    const booking = await request.get('/book/pilot-gym', { maxRedirects: 0 });
    expect(booking.status()).toBe(404);
    // The API says 401 for itself, rather than redirecting.
    expect((await request.get('/api/v1/me', { maxRedirects: 0 })).status()).toBe(401);

    // A return address on another site is ignored: after sign-in the person is at the signed-in
    // home. One case is enough here; the unit tests cover the rules for the others.
    const address = newAddress('owner');
    await createAccount(address);
    await page.goto(`/login?returnTo=${encodeURIComponent('https://evil.example/home')}`);
    await signInWithCode(page, copy, address);
    await expect(page).toHaveURL(`${baseURL}/home`);
    await expect(page.getByRole('heading', { level: 1, name: copy.home.title })).toBeVisible();
  });

  test('AC12: sign out signs this browser out', async ({
    page,
    browser,
    context,
    baseURL,
    appLocale,
    messages: copy,
  }) => {
    const address = newAddress('owner');
    await createAccount(address);
    // Two browsers of the same person, each with its own cookies and its own visitor IP address.
    const otherContext = await browser.newContext({
      baseURL,
      locale: formattingLocales[appLocale],
      extraHTTPHeaders: clientIpHeaders(),
    });
    const otherPage = await otherContext.newPage();
    try {
      for (const [index, browserPage] of [page, otherPage].entries()) {
        await browserPage.goto('/login');
        await signInWithCode(browserPage, copy, address, index + 1);
        await expect(browserPage).toHaveURL(`${baseURL}/home`);
      }

      // The sign-in session lasts 30 days: the cookie is HttpOnly, SameSite=Lax and ends in 30 days.
      const cookie = (await context.cookies()).find(({ name }) => name.includes('session_token'));
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
      const thirtyDays = 30 * 24 * 60 * 60;
      expect(Math.abs((cookie?.expires ?? 0) - (Date.now() / 1000 + thirtyDays))).toBeLessThan(120);

      // Sign out is on the signed-in page.
      await expectNoAxeViolations(page, 'the signed-in home with sign out');
      await page.getByRole('button', { name: copy.signOut.label }).click();

      // This browser is at the sign-in page, signed out, and its next trainer-web page goes to sign-in.
      await expect(page).toHaveURL(`${baseURL}/login`);
      await expect(page.getByRole('heading', { level: 1, name: copy.signIn.title })).toBeVisible();
      expect((await page.request.get('/api/v1/me')).status()).toBe(401);
      await page.goto('/home');
      await expect(page).toHaveURL(/\/login\?returnTo=%2Fhome$/);

      // The other browser is still signed in.
      await otherPage.reload();
      await expect(otherPage).toHaveURL(`${baseURL}/home`);
      await expect(
        otherPage.getByRole('heading', { level: 1, name: copy.home.title }),
      ).toBeVisible();
      expect((await otherPage.request.get('/api/v1/me')).status()).toBe(200);
    } finally {
      await otherContext.close();
    }
  });

  test('AC12: when sign out fails the person sees why and is still signed in', async ({
    page,
    baseURL,
    messages: copy,
  }) => {
    const address = newAddress('owner');
    await createAccount(address);
    await page.goto('/login');
    await signInWithCode(page, copy, address);
    await expect(page).toHaveURL(`${baseURL}/home`);
    await page.route('**/api/auth/sign-out', (route) => route.fulfill({ status: 500 }));
    const signOutButton = page.getByRole('button', { name: copy.signOut.label });

    await signOutButton.click();

    // The error is shown, the button works again and nothing signed the person out.
    await expect(page.getByRole('alert').filter({ hasText: copy.signOut.error })).toBeVisible();
    await expect(signOutButton).toBeEnabled();
    await expect(page).toHaveURL(`${baseURL}/home`);
    expect((await page.request.get('/api/v1/me')).status()).toBe(200);
    await expectNoAxeViolations(page, 'the signed-in home after a failed sign out');
  });

  test('AC12: using a signed-in page renews the session and the browser gets its new cookie', async ({
    page,
    baseURL,
    messages: copy,
  }) => {
    const address = newAddress('owner');
    await createAccount(address);
    await page.goto('/login');
    await signInWithCode(page, copy, address);
    await expect(page).toHaveURL(`${baseURL}/home`);
    const day = 24 * 60 * 60 * 1000;

    // A session that was last used 20 days ago has 10 days left. (The day after sign-in is enough
    // for a renewal; the API integration test covers the timing, this the way to the browser.)
    await setSessionExpiry(address, new Date(Date.now() + 10 * day));
    const response = await page.goto('/home');

    // The page answer carries the new cookie: HttpOnly, SameSite=Lax, 30 days.
    const cookies = (await response?.headersArray())?.filter(
      ({ name }) => name.toLowerCase() === 'set-cookie',
    );
    const renewed = cookies?.find(({ value }) => value.includes('session_token'))?.value;
    expect(renewed).toMatch(/Max-Age=2592000/i);
    expect(renewed).toMatch(/HttpOnly/i);
    expect(renewed).toMatch(/SameSite=Lax/i);
    // And the stored session ends 30 days from this use.
    const [expiry] = await sessionExpiries(address);
    expect(Math.abs((expiry?.getTime() ?? 0) - (Date.now() + 30 * day))).toBeLessThan(120_000);
    await expect(page.getByRole('heading', { level: 1, name: copy.home.title })).toBeVisible();
  });

  test('AC7 (code): a wrong code shows the neutral message and keeps the code step', async ({
    page,
    messages: copy,
  }) => {
    const address = newAddress('owner');
    await createAccount(address);

    await page.goto('/login');
    await page.getByLabel(copy.signIn.emailLabel).fill(address);
    await page.getByRole('button', { name: copy.signIn.sendCode }).click();
    const email = await waitForEmail(address);
    const wrong = signInCode(email) === '000000' ? '111111' : '000000';

    await page.getByLabel(copy.signIn.codeLabel).fill(wrong);
    await page.getByRole('button', { name: copy.signIn.submitCode }).click();

    // The API's English message is never shown; the page words the failure itself.
    await expect(
      page.getByRole('alert').filter({ hasText: copy.signIn.errors.invalidOrExpiredCode }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await expectNoAxeViolations(page, 'the code step after a wrong code');

    // The right code still works: one typo doesn't cost a new email (AC6 allows a few tries).
    await page.getByLabel(copy.signIn.codeLabel).fill(signInCode(email));
    await page.getByRole('button', { name: copy.signIn.submitCode }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page).toHaveTitle(copy.home.title);
  });

  test('AC4 (code): resending sends a new email whose code replaces the old one', async ({
    page,
    messages: copy,
  }) => {
    const address = newAddress('owner');
    await createAccount(address);

    await page.goto('/login');
    await page.getByLabel(copy.signIn.emailLabel).fill(address);
    await page.getByRole('button', { name: copy.signIn.sendCode }).click();
    const [first] = await waitForEmails(address);
    if (!first) throw new Error('No email arrived.');
    const code = page.getByLabel(copy.signIn.codeLabel);
    await code.fill(signInCode(first));

    await page.getByRole('button', { name: copy.signIn.resend }).click();

    // A second EM-08 (two in total), neutral wording like the first, and the field starts empty.
    const [, second] = await waitForEmails(address, 2);
    if (!second) throw new Error('No second email arrived.');
    expect(await emailsTo(address)).toHaveLength(2);
    expect(second.subject).toBe(copy.email.signIn.subject);
    await expect(
      page.getByRole('status').filter({ hasText: copy.signIn.resent.replace('{email}', address) }),
    ).toBeVisible();
    await expect(code).toHaveValue('');
    await expect(code).toBeFocused();

    // The new code replaces the old one: the old one is refused, the new one signs in.
    await code.fill(signInCode(first));
    await page.getByRole('button', { name: copy.signIn.submitCode }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: copy.signIn.errors.invalidOrExpiredCode }),
    ).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
    await code.fill(signInCode(second));
    await page.getByRole('button', { name: copy.signIn.submitCode }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page).toHaveTitle(copy.home.title);
    expect(await emailsTo(address)).toHaveLength(2);
  });

  test('changes the email address from the code step and keeps what was typed', async ({
    page,
    messages: copy,
  }) => {
    const address = newAddress('owner');
    await createAccount(address);

    await page.goto('/login');
    await page.getByLabel(copy.signIn.emailLabel).fill(address);
    await page.getByRole('button', { name: copy.signIn.sendCode }).click();
    await waitForEmail(address);

    await page.getByRole('button', { name: copy.signIn.changeEmail }).click();

    // Back on the email step with the address still in the field, ready to be edited.
    await expect(page.getByRole('heading', { level: 1, name: copy.signIn.title })).toBeVisible();
    await expect(page.getByLabel(copy.signIn.emailLabel)).toHaveValue(address);
    await expect(page.getByLabel(copy.signIn.codeLabel)).toHaveCount(0);
  });

  test('AC9 (page): an allowed address without an account signs in and gets its account in the page language', async ({
    page,
    appLocale,
    messages: copy,
  }) => {
    const address = newAllowedAddress('pilot');

    await page.goto('/login');
    await page.getByLabel(copy.signIn.emailLabel).fill(address);
    await page.getByRole('button', { name: copy.signIn.sendCode }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: copy.signIn.checkEmailTitle }),
    ).toBeVisible();
    // The email is sent after the answer: wait for it, don't race it.
    const email = await waitForEmail(address);

    await page.getByLabel(copy.signIn.codeLabel).fill(signInCode(email));
    await page.getByRole('button', { name: copy.signIn.submitCode }).click();

    await expect(page).toHaveURL(/\/home$/);
    // Wait for the page itself: the closing axe check needs its <title>, which streams in after the URL changes.
    await expect(page).toHaveTitle(copy.home.title);
    const session = await page.request.get('/api/auth/get-session');
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe(address);
    expect(await emailsTo(address)).toHaveLength(1);

    // The new account carries the language of the sign-in page.
    const me = await page.request.get('/api/v1/me');
    const { preferredLocale } = (await me.json()) as { preferredLocale: string | null };
    expect(preferredLocale).toBe(appLocale);
  });

  test('AC8 (page): an address that is neither an account nor allowed sees the same code step', async ({
    page,
    messages: copy,
  }) => {
    const stranger = newAddress('stranger');
    const allowed = newAllowedAddress('pilot');

    await page.goto('/login');
    await page.getByLabel(copy.signIn.emailLabel).fill(stranger);
    await page.getByRole('button', { name: copy.signIn.sendCode }).click();

    // The same step and wording as for an account: nothing shows the address is unknown.
    await expect(
      page.getByRole('heading', { level: 1, name: copy.signIn.checkEmailTitle }),
    ).toBeVisible();
    await expect(
      page.getByText(copy.signIn.checkEmailBody.replace('{email}', stranger)),
    ).toBeVisible();
    await expect(page.getByLabel(copy.signIn.codeLabel)).toBeVisible();

    // No email goes out for it. An email cannot be waited for when none comes, so a later request
    // (an allowed address) is awaited first: its email arrives after the first request's work
    // (which started earlier and does less) has had its chance to send one.
    await page.getByRole('button', { name: copy.signIn.changeEmail }).click();
    await page.getByLabel(copy.signIn.emailLabel).fill(allowed);
    await page.getByRole('button', { name: copy.signIn.sendCode }).click();
    await waitForEmail(allowed);
    expect(await emailsTo(stranger)).toHaveLength(0);
  });

  test('AC3: link opens the confirm step and signs in on confirm', async ({
    page,
    appLocale,
    messages: copy,
  }) => {
    const address = newAddress('owner');
    await createAccount(address);
    // The sign-in page remembers the page asked for and sends it with the email request, so the
    // emailed link carries it (#207), as the code step ends there.
    await page.goto(`/login?returnTo=${encodeURIComponent(`/home?${REQUESTED_QUERY}`)}`);
    await page.getByLabel(copy.signIn.emailLabel).fill(address);
    await page.getByRole('button', { name: copy.signIn.sendCode }).click();
    const link = signInLink(await waitForEmail(address));
    expect(new URL(link).searchParams.get('returnTo')).toBe(`/home?${REQUESTED_QUERY}`);
    const masked = `${address[0]}***@${address.split('@')[1]}`;
    const signedInAs = async () => {
      const session = await page.request.get('/api/auth/get-session');
      return ((await session.json()) as { user: { email: string } } | null)?.user.email;
    };

    // An email scanner opens the link first: it gets the page and uses nothing up.
    expect((await page.request.get(link)).ok()).toBe(true);
    await page.goto(link);

    // The confirm step shows the masked address and one button; the whole address is not on it.
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: copy.signIn.confirmTitle.replace('{email}', masked),
      }),
    ).toBeVisible();
    await expect(page.getByRole('button')).toHaveCount(1);
    expect(await page.content()).not.toContain(address);
    // The address carries the token: it must not leave in a Referer header.
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
    await expectNoAxeViolations(page, `the confirm step in ${appLocale}`);
    // Opening it (twice) signed nobody in and used nothing up.
    await page.reload();
    await expect(page.getByRole('button', { name: copy.signIn.confirmSubmit })).toBeVisible();
    expect(await signedInAs()).toBeUndefined();

    await page.getByRole('button', { name: copy.signIn.confirmSubmit }).click();

    // The browser that opened the link is signed in, as the account of the address.
    await expect(page).toHaveURL(new RegExp(`/home\\?${REQUESTED_QUERY}$`));
    await expect(page.getByRole('heading', { level: 1, name: copy.home.title })).toBeVisible();
    await expect(page).toHaveTitle(copy.home.title);
    expect(await signedInAs()).toBe(address);
    expect(await emailsTo(address)).toHaveLength(1);
  });

  test('AC3 (#207): a return address on another site never reaches the link, which ends at the signed-in home', async ({
    page,
    messages: copy,
  }) => {
    const address = newAddress('owner');
    await createAccount(address);
    await page.goto(`/login?returnTo=${encodeURIComponent('https://evil.example/phish')}`);
    await page.getByLabel(copy.signIn.emailLabel).fill(address);
    await page.getByRole('button', { name: copy.signIn.sendCode }).click();
    const link = signInLink(await waitForEmail(address));
    expect(new URL(link).searchParams.has('returnTo')).toBe(false);
    expect(link).not.toContain('evil.example');

    await page.goto(link);
    await page.getByRole('button', { name: copy.signIn.confirmSubmit }).click();

    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('heading', { level: 1, name: copy.home.title })).toBeVisible();
  });

  test('AC9 (link): an allowed address without an account signs in with the link and gets its account in the page language', async ({
    page,
    appLocale,
    messages: copy,
  }) => {
    const address = newAllowedAddress('pilot');
    await page.goto('/login');
    await page.getByLabel(copy.signIn.emailLabel).fill(address);
    await page.getByRole('button', { name: copy.signIn.sendCode }).click();
    const link = signInLink(await waitForEmail(address));
    // Without a page asked for, the link is the plain one (#207).
    expect(new URL(link).searchParams.has('returnTo')).toBe(false);

    await page.goto(link);
    await page.getByRole('button', { name: copy.signIn.confirmSubmit }).click();

    await expect(page).toHaveURL(/\/home$/);
    await expect(page).toHaveTitle(copy.home.title);
    const me = await page.request.get('/api/v1/me');
    expect(await me.json()).toMatchObject({ email: address, preferredLocale: appLocale });
  });

  test('AC7: a used link and a wrong code show the neutral messages', async ({
    page,
    appLocale,
    messages: copy,
  }) => {
    const address = newAddress('owner');
    await createAccount(address);
    await page.goto('/login');
    await page.getByLabel(copy.signIn.emailLabel).fill(address);
    await page.getByRole('button', { name: copy.signIn.sendCode }).click();
    const email = await waitForEmail(address);
    const link = signInLink(email);

    // A wrong code: the code is incorrect or has expired, nothing more.
    await page
      .getByLabel(copy.signIn.codeLabel)
      .fill(signInCode(email) === '000000' ? '111111' : '000000');
    await page.getByRole('button', { name: copy.signIn.submitCode }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: copy.signIn.errors.invalidOrExpiredCode }),
    ).toBeVisible();

    // The link signs in once ...
    await page.goto(link);
    await page.getByRole('button', { name: copy.signIn.confirmSubmit }).click();
    await expect(page).toHaveURL(/\/home$/);

    // ... and when it is opened again (a second tab) it no longer works.
    const second = await page.context().newPage();
    await second.goto(link);
    await expect(
      second.getByRole('heading', { level: 1, name: copy.signIn.linkInvalidTitle }),
    ).toBeVisible();
    await expect(second.getByText(copy.signIn.linkInvalidBody)).toBeVisible();
    await expectNoAxeViolations(second, `the used link in ${appLocale}`);

    // A link that never existed, or has no token, looks exactly the same.
    for (const path of ['/login/confirm?token=never-issued', '/login/confirm']) {
      await second.goto(path);
      await expect(
        second.getByRole('heading', { level: 1, name: copy.signIn.linkInvalidTitle }),
      ).toBeVisible();
    }

    // The button goes back to the sign-in page, where a new email is requested.
    await second.getByRole('link', { name: copy.signIn.linkInvalidBack }).click();
    await expect(second).toHaveURL(/\/login$/);
    await expect(second.getByRole('heading', { level: 1, name: copy.signIn.title })).toBeVisible();
  });
});

/**
 * Signs in on the page: types the address, waits for the email on the fake Brevo server and enters
 * its code (the latest of `emailCount` sent to the address so far). The page must be on the
 * sign-in page already (`/login`, possibly with a return path).
 */
async function signInWithCode(
  page: Page,
  copy: Messages,
  address: string,
  emailCount = 1,
): Promise<void> {
  await page.getByLabel(copy.signIn.emailLabel).fill(address);
  await page.getByRole('button', { name: copy.signIn.sendCode }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: copy.signIn.checkEmailTitle }),
  ).toBeVisible();
  const email = (await waitForEmails(address, emailCount)).at(-1);
  if (!email) throw new Error('No email arrived.');
  await page.getByLabel(copy.signIn.codeLabel).fill(signInCode(email));
  await page.getByRole('button', { name: copy.signIn.submitCode }).click();
}
