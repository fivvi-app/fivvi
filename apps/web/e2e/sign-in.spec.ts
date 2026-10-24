import { createAccount, newAddress, newIpAddress } from './accounts';
import { emailsTo, signInCode, signInLink, waitForEmail, waitForEmails } from './brevo';
import { expect, expectNoAxeViolations, test } from './fixtures';

// F001, TW-10 `/login`: the email step, then the code step on the same screen. Copy comes from
// the catalogs. The emails go to the fake Brevo server (e2e/fake-brevo.ts), which the specs read
// the code from; every spec has an address of its own.
test.describe('F001 sign in on TW-10', () => {
  // Better Auth limits sign-in requests per IP address, and every browser here comes from the same
  // one. A forwarded address of its own gives each spec its own limit, like separate visitors.
  // This works only because packages/auth sets no trusted IP header yet, so Better Auth takes the
  // client-sent `x-forwarded-for`; #134 (rate limits) changes that, and this helper with it.
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ 'x-forwarded-for': newIpAddress() });
  });

  test('AC2: signs in with the code and returns to the requested page', async ({
    page,
    appLocale,
    messages: copy,
  }) => {
    const address = newAddress('owner');
    await createAccount(address);

    await page.goto('/login');
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

    // The signed-in home (until F002 adds workspaces). The route guard that sends a visitor to
    // the page they asked for, and back after sign-in, is the next ticket.
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('heading', { level: 1, name: copy.home.title })).toBeVisible();
    await expect(page).toHaveTitle(copy.home.title);

    // The data path: the sign-in session cookie this browser holds belongs to the account.
    const session = await page.request.get('/api/auth/get-session');
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe(address);
    expect(await emailsTo(address)).toHaveLength(1);
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
});
