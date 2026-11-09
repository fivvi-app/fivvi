import { randomUUID } from 'node:crypto';
import { messages as catalogs, formattingLocales, type Locale } from '@fivvi/i18n';
import { clientIpHeaders, newAddress, newIpAddress } from './accounts';
import { emailsTo, type ReceivedEmail } from './brevo';
import { expect, test } from './fixtures';
import { DEMO_REQUEST_ADDRESS } from './servers';

// F064 (spec #611, ticket #641): the demo page and its form. The form posts to the real API, which
// emails Fivvi's support address; here that email goes to the fake Brevo server
// (e2e/fake-brevo.ts). Every test has a visitor and an IP address of its own.
// In production this is support@fivvi.app; the e2e servers send to a fake mailbox (servers.ts).
const SUPPORT = DEMO_REQUEST_ADDRESS;
const DEMO: Record<Locale, string> = { 'nl-NL': '/demo', en: '/en/demo' };
const PRICING: Record<Locale, string> = { 'nl-NL': '/prijzen', en: '/en/pricing' };
const SUPPORT_PAGE: Record<Locale, string> = { 'nl-NL': '/support', en: '/en/support' };

/** A name no other test uses, so its email can be told apart on the shared fake server. */
const newName = () => `Anna ${randomUUID().slice(0, 8)}`;

/** The demo emails the support address got for `name`. */
async function requestsFrom(name: string): Promise<ReceivedEmail[]> {
  return (await emailsTo(SUPPORT)).filter((email) => email.text.includes(name));
}

test.describe('F064 the demo page and its form', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  for (const locale of ['nl-NL', 'en'] as const) {
    test(`AC1: ${locale} has its text and the form in the HTML, without JavaScript`, async ({
      browser,
      baseURL,
    }) => {
      const copy = catalogs[locale].site;
      const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
      const page = await context.newPage();

      await page.goto(DEMO[locale]);

      await expect(page.locator('html')).toHaveAttribute('lang', formattingLocales[locale]);
      await expect(page).toHaveTitle(copy.demo.metaTitle);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.demo.headline);
      await expect(page.getByText(copy.home.status)).toBeVisible();
      await expect(page.getByText(copy.demo.steps.tell.title)).toBeVisible();
      await expect(page.getByLabel(copy.demo.form.name)).toBeVisible();
      await expect(page.getByLabel(copy.demo.form.email)).toBeVisible();
      await context.close();
    });
  }

  test('since go-live (#648) the header, the pricing page and the help page link to it, and it sends no robots tag of its own', async ({
    page,
    appLocale,
    messages: copy,
  }) => {
    await page.goto(appLocale === 'en' ? '/en' : '/');
    const link = page.getByRole('link', { name: copy.site.header.demo }).first();
    await expect(link).toHaveAttribute('href', DEMO[appLocale]);
    for (const path of [PRICING[appLocale], SUPPORT_PAGE[appLocale]]) {
      await page.goto(path);
      await expect(page.locator('main a[href$="/demo"]').first()).toBeVisible();
    }

    const response = await page.goto(DEMO[appLocale]);

    expect(response?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });

  test('AC5: a valid request sends one email to support in Dutch, shows the confirmation, and writes to no one else', async ({
    page,
    appLocale,
    messages: copy,
  }) => {
    const name = newName();
    const visitor = newAddress('anna');
    const form = copy.site.demo.form;
    await page.goto(DEMO[appLocale]);

    await page.getByLabel(form.name).fill(name);
    await page.getByLabel(form.email).fill(visitor);
    await page.getByLabel(form.business).selectOption('studio');
    await page.getByLabel(form.trainers).selectOption('two-to-four');
    await page.getByLabel(form.message).fill('Ik wil de roosters zien.');
    await page.getByRole('button', { name: form.send }).click();

    await expect(page.getByRole('status')).toHaveText(form.sent);
    const [email, ...others] = await requestsFrom(name);
    expect(others).toEqual([]);
    expect(email?.to).toBe(SUPPORT);
    // In the owner's language, whatever the visitor's.
    expect(email?.subject).toBe(`Demo-aanvraag: ${name}`);
    for (const answer of [
      visitor,
      catalogs['nl-NL'].email.demoRequest.business.studio,
      '2 tot 4',
      'Ik wil de roosters zien.',
    ]) {
      expect(email?.text).toContain(answer);
    }
    expect(email?.text).toContain(
      appLocale === 'en'
        ? catalogs['nl-NL'].email.demoRequest.languageEn
        : catalogs['nl-NL'].email.demoRequest.languageNl,
    );
    // No confirmation email to the visitor.
    expect(await emailsTo(visitor)).toEqual([]);
  });

  test('AC6: an invalid email address and a missing name show the error under the field, and send nothing', async ({
    page,
    appLocale,
    messages: copy,
  }) => {
    const form = copy.site.demo.form;
    const errors = copy.site.demo.errors;
    const visitor = newAddress('anna');
    await page.goto(DEMO[appLocale]);

    await page.getByLabel(form.email).fill('anna@');
    await page.getByRole('button', { name: form.send }).click();

    const name = page.getByLabel(form.name);
    const email = page.getByLabel(form.email);
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toBeFocused();
    await expect(name).toHaveAccessibleDescription(errors.nameRequired);
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAccessibleDescription(errors.emailInvalid);
    await expect(page.getByRole('status')).toHaveCount(0);

    // Mending the fields sends it, and the errors go.
    await name.fill(newName());
    await email.fill(visitor);
    await page.getByRole('button', { name: form.send }).click();
    await expect(page.getByRole('status')).toHaveText(form.sent);
  });

  test('AC6: a filled honeypot looks like a success and sends no email', async ({
    page,
    appLocale,
    messages: copy,
  }) => {
    const name = newName();
    const form = copy.site.demo.form;
    await page.goto(DEMO[appLocale]);
    await page.getByLabel(form.name).fill(name);
    await page.getByLabel(form.email).fill(newAddress('bot'));
    // A person cannot reach it; a bot fills every field.
    await page.locator('input[name="website"]').evaluate((input: HTMLInputElement) => {
      input.value = 'https://spam.example.com';
    });

    await page.getByRole('button', { name: form.send }).click();

    await expect(page.getByRole('status')).toHaveText(form.sent);
    expect(await requestsFrom(name)).toEqual([]);
  });

  test('AC6: after too many requests from one address the visitor is told, and no email is sent', async ({
    page,
    request,
    appLocale,
    baseURL,
    messages: copy,
  }) => {
    const ip = newIpAddress();
    await page.context().setExtraHTTPHeaders({ 'x-real-ip': ip });
    const body = (name: string) => ({
      name,
      email: newAddress('anna'),
      businessKind: 'gym',
      trainerCount: 'one',
      locale: appLocale,
    });
    for (let i = 0; i < 5; i++) {
      const sent = await request.post(`${baseURL}/api/v1/demo-requests`, {
        headers: { 'x-real-ip': ip },
        data: body(newName()),
      });
      expect(sent.status()).toBe(202);
    }
    const name = newName();
    const form = copy.site.demo.form;
    await page.goto(DEMO[appLocale]);

    await page.getByLabel(form.name).fill(name);
    await page.getByLabel(form.email).fill(newAddress('anna'));
    await page.getByRole('button', { name: form.send }).click();

    await expect(page.getByRole('form', { name: form.label }).getByRole('alert')).toHaveText(
      copy.site.demo.errors.rateLimited.replace('{email}', 'support@fivvi.app'),
    );
    expect(await requestsFrom(name)).toEqual([]);
    // The form keeps what was typed, and no confirmation is shown.
    await expect(page.getByLabel(form.name)).toHaveValue(name);
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('AC5: when the email cannot be sent the visitor is told honestly, keeps what was typed, and can write to support', async ({
    page,
    appLocale,
    messages: copy,
  }) => {
    await page.route('**/api/v1/demo-requests', (route) =>
      route.fulfill({ status: 503, json: { code: 'unavailable' } }),
    );
    const name = newName();
    const form = copy.site.demo.form;
    await page.goto(DEMO[appLocale]);

    await page.getByLabel(form.name).fill(name);
    await page.getByLabel(form.email).fill(newAddress('anna'));
    await page.getByRole('button', { name: form.send }).click();

    const alert = page.getByRole('form', { name: copy.site.demo.form.label }).getByRole('alert');
    // The address to write to is the real support address, whatever mailbox this server sends to.
    await expect(alert).toHaveText(
      copy.site.demo.errors.failed.replace('{email}', 'support@fivvi.app'),
    );
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByLabel(form.name)).toHaveValue(name);
  });

  test('AC16: the page sets no cookie and keeps nothing in the browser, also after a request', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const form = copy.site.demo.form;
    await page.goto(DEMO[appLocale]);
    await page.getByLabel(form.name).fill(newName());
    await page.getByLabel(form.email).fill(newAddress('anna'));
    await page.getByRole('button', { name: form.send }).click();
    await expect(page.getByRole('status')).toHaveText(form.sent);

    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  });
});
