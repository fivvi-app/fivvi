import type { Messages } from '@fivvi/i18n';
import type { Page } from '@playwright/test';
import { signInCode, waitForEmails } from './brevo';
import { expect } from './fixtures';

/**
 * Signs in on the page: types the address, waits for the email on the fake Brevo server and enters
 * its code (the latest of `emailCount` sent to the address so far). The page must be on the
 * sign-in page already (`/login`, possibly with a return path).
 */
export async function signInWithCode(
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
