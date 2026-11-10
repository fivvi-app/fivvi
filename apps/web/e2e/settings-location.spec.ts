import type { Page } from '@playwright/test';
import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  joinTeam,
  newAddress,
  newAllowedAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';
import { signInWithCode } from './sign-in-page';

// F015, TW-08 Settings → Location (`/w/{slug}/settings/locations`): the Owner names the
// workspace's one location and gives it an address, with the street and city looked up from the
// postcode and house number. The e2e server runs the fake lookup (packages/api/src/address-lookup/
// fake.ts), so no spec calls PDOK: 1234 AB 1 is Voorbeeldstraat, Amsterdam; 1234 AB 3 is
// Proeflaan, Haarlem; 1000 AA is a lookup that does not answer; anything else is no match. Copy
// comes from the catalogs. Each spec has an account and a workspace of its own.
const TOO_LONG = 'x'.repeat(121);

interface ApiLocation {
  id: string;
  name: string;
  type: string;
  isDefault: boolean;
  address: {
    postcode: string;
    houseNumber: string;
    houseNumberAddition: string | null;
    street: string;
    city: string;
  } | null;
}

/** The workspace's locations as the API holds them, for the signed-in page's session. */
async function locationsOf(page: Page, slug: string): Promise<ApiLocation[]> {
  const me = (await (await page.request.get('/api/v1/me')).json()) as {
    workspaces: { id: string; slug: string }[];
  };
  const workspace = me.workspaces.find((candidate) => candidate.slug === slug);
  if (!workspace) throw new Error(`The account is not on the team of ${slug}.`);
  const response = await page.request.get(`/api/v1/workspaces/${workspace.id}/locations`);
  expect(response.status()).toBe(200);
  return (await response.json()) as ApiLocation[];
}

/**
 * Holds back the answers of the address lookup whose URL ends in `urlEnd` until `release()` is
 * called, so a spec decides when a slow answer arrives instead of waiting for a timer.
 * `held` resolves once a request is on hold.
 */
async function holdLookups(page: Page, urlEnd: string) {
  let release: () => void = () => {};
  const open = new Promise<void>((resolve) => {
    release = resolve;
  });
  let onHold: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    onHold = resolve;
  });
  await page.route(`**/address-lookup**${urlEnd}`, async (route) => {
    onHold();
    await open;
    await route.continue();
  });
  return { held, release };
}

/** Two animation frames: what the page does with an answer it has just received is done by then. */
const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

test.describe('F015 Settings → Location (TW-08)', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  /** An Owner of a new workspace "John's Gym", signed in on the location page. */
  async function johnOnLocationPage(page: Page, context: Parameters<typeof signInWithSession>[0]) {
    const address = newAddress('john');
    await createAccount(address);
    const slug = await createGymWithTrainer(address, "John's Gym", 'owner');
    await signInWithSession(context, address);
    await page.goto(`/w/${slug}/settings/locations`);
    return slug;
  }

  test('AC2: a new workspace shows its location', async ({ page, appLocale, messages: copy }) => {
    await page.goto('/login');
    await signInWithCode(page, copy, newAllowedAddress('pilot'));
    await page.getByLabel(copy.welcome.personNameLabel).fill('Pilot');
    await page.getByLabel(copy.welcome.workspaceNameLabel).fill('Pilot Two');
    await page.getByRole('button', { name: copy.welcome.submit }).click();
    await expect(page).toHaveURL(/\/w\/pilot-two(-\d+)?$/);
    const slug = new URL(page.url()).pathname.replace('/w/', '');

    // Settings → Location is a third tab beside General and Language.
    const nav = page.getByRole('navigation', { name: copy.workspaceNav.label });
    await nav.getByRole('link', { name: copy.workspaceNav.settingsLocation }).click();

    await expect(page).toHaveURL(`/w/${slug}/settings/locations`);
    await expect(
      page.getByRole('heading', { level: 2, name: copy.settingsLocation.title }),
    ).toBeVisible();
    await expect(page.getByText(copy.settingsLocation.help)).toBeVisible();
    await expect(page.getByLabel(copy.settingsLocation.nameLabel)).toHaveValue('Pilot Two');
    for (const label of [
      copy.settingsLocation.postcodeLabel,
      copy.settingsLocation.houseNumberLabel,
      copy.settingsLocation.additionLabel,
      copy.settingsLocation.streetLabel,
      copy.settingsLocation.cityLabel,
    ]) {
      await expect(page.getByLabel(label, { exact: true })).toHaveValue('');
    }
    await expect(page.getByText(copy.settingsLocation.types.organizationLocation)).toBeVisible();
    await expectNoAxeViolations(page, `TW-08 Location in ${appLocale}`);
    // The data path: the API holds the one location, named after the workspace, with no address.
    expect(await locationsOf(page, slug)).toEqual([
      {
        id: expect.any(String),
        name: 'Pilot Two',
        type: 'organization_location',
        address: null,
        isDefault: true,
      },
    ]);
  });

  test('AC4: Owner saves the location', async ({ page, context, appLocale, messages: copy }) => {
    const slug = await johnOnLocationPage(page, context);
    const text = copy.settingsLocation;

    await page.getByLabel(text.nameLabel).fill("John's Gym Centrum");
    await page.getByLabel(text.postcodeLabel, { exact: true }).fill('5678 CD');
    await page.getByLabel(text.houseNumberLabel).fill('22');
    // The lookup knows 5678 CD 22; the Owner adds an addition by hand.
    await expect(page.getByLabel(text.streetLabel)).toHaveValue('Proefplein');
    await page.getByLabel(text.additionLabel).fill('2 hoog');
    await page.getByRole('button', { name: text.save }).click();

    await expect(page.getByText(text.saved)).toBeVisible();
    // The pointer stays on the button after the click; axe judges the button at rest.
    await page.mouse.move(0, 0);
    await expectNoAxeViolations(page, `TW-08 Location after saving in ${appLocale}`);
    // The data path: the next read of the location returns the new name and address.
    expect(await locationsOf(page, slug)).toEqual([
      {
        id: expect.any(String),
        name: "John's Gym Centrum",
        type: 'organization_location',
        isDefault: true,
        address: {
          postcode: '5678 CD',
          houseNumber: '22',
          houseNumberAddition: '2 hoog',
          street: 'Proefplein',
          city: 'Utrecht',
        },
      },
    ]);
    await page.reload();
    await expect(page.getByLabel(text.nameLabel)).toHaveValue("John's Gym Centrum");
    await expect(page.getByLabel(text.cityLabel)).toHaveValue('Utrecht');
    await expect(page.getByLabel(text.additionLabel)).toHaveValue('2 hoog');
  });

  test('AC5: validation messages', async ({ page, context, appLocale, messages: copy }) => {
    const slug = await johnOnLocationPage(page, context);
    const text = copy.settingsLocation;
    const name = page.getByLabel(text.nameLabel);
    const save = page.getByRole('button', { name: text.save });

    await name.fill('   ');
    await save.click();
    await expect(page.getByText(text.errors.nameRequired)).toBeVisible();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    // The pointer stays on the button after the click; axe judges the button at rest.
    await page.mouse.move(0, 0);
    await expectNoAxeViolations(page, `TW-08 Location with an error in ${appLocale}`);

    await name.fill(TOO_LONG);
    await save.click();
    await expect(page.getByText(text.errors.nameTooLong)).toBeVisible();
    await expect(name).toHaveValue(TOO_LONG);
    await expect(page.getByText(text.saved)).toHaveCount(0);
    // The pointer stays on the button after the click; axe judges the button at rest.
    await page.mouse.move(0, 0);
    await expectNoAxeViolations(page, `TW-08 Location with a too long name in ${appLocale}`);
    // Nothing changed.
    expect((await locationsOf(page, slug))[0]?.name).toBe("John's Gym");
  });

  test('AC6: Trainer has no Settings', async ({ page, context, appLocale, messages: copy }) => {
    const john = newAddress('john');
    const sarah = newAddress('sarah');
    await createAccount(john, undefined, 'John');
    await createAccount(sarah, undefined, 'Sarah');
    const slug = await createGymWithTrainer(john, "John's Gym", 'owner');
    await joinTeam(sarah, slug);
    await signInWithSession(context, sarah);

    await page.goto(`/w/${slug}`);
    const nav = page.getByRole('navigation', { name: copy.workspaceNav.label });
    await expect(nav.getByRole('link')).toHaveText([copy.workspaceNav.clients]);

    await page.goto(`/w/${slug}/settings/locations`);
    await expect(
      page.getByRole('heading', { level: 1, name: copy.noPermission.title }),
    ).toBeVisible();
    await expect(
      page.getByText(copy.noPermission.body.replace('{workspace}', "John's Gym")),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: copy.settingsLocation.save })).toHaveCount(0);
    await expectNoAxeViolations(page, `the no-permission page of Location in ${appLocale}`);

    // She may read the location (sessions show it from M4) but not change it.
    const [location] = await locationsOf(page, slug);
    const me = (await (await page.request.get('/api/v1/me')).json()) as {
      workspaces: { id: string }[];
    };
    const patch = await page.request.patch(
      `/api/v1/workspaces/${me.workspaces[0]?.id}/locations/${location?.id}`,
      { data: { name: 'Sarah’s Gym' } },
    );
    expect(patch.status()).toBe(403);
    expect((await locationsOf(page, slug))[0]?.name).toBe("John's Gym");
  });

  test('AC13: postcode and house number fill street and city; hand-typed text is kept', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    await johnOnLocationPage(page, context);
    const text = copy.settingsLocation;
    const street = page.getByLabel(text.streetLabel);
    const city = page.getByLabel(text.cityLabel);
    const houseNumber = page.getByLabel(text.houseNumberLabel);

    await page.getByLabel(text.postcodeLabel, { exact: true }).fill('1234 AB');
    await houseNumber.fill('1');

    await expect(street).toHaveValue('Voorbeeldstraat');
    await expect(city).toHaveValue('Amsterdam');
    await expect(page.getByText(text.lookup.filled)).toBeVisible();
    await expectNoAxeViolations(page, `TW-08 Location after a lookup in ${appLocale}`);
    // Both stay editable: the Owner types her own street ...
    await street.fill('Mijn eigen straat');
    await expect(street).toHaveValue('Mijn eigen straat');
    // ... and a new house number looks up again: the city is replaced, the typed street is kept.
    await houseNumber.fill('3');
    await expect(city).toHaveValue('Haarlem');
    await expect(street).toHaveValue('Mijn eigen straat');
    await expect(page.getByText(text.lookup.filled)).toBeVisible();

    // The lookup went through our API, never from the browser to the address service.
    await page.getByRole('button', { name: text.save }).click();
    await expect(page.getByText(text.saved)).toBeVisible();
  });

  test('AC13: what a lookup filled is emptied when the next query has no match; typed text stays', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    await johnOnLocationPage(page, context);
    const text = copy.settingsLocation;
    const postcode = page.getByLabel(text.postcodeLabel, { exact: true });
    const houseNumber = page.getByLabel(text.houseNumberLabel);
    const street = page.getByLabel(text.streetLabel);
    const city = page.getByLabel(text.cityLabel);

    await postcode.fill('1234 AB');
    await houseNumber.fill('1');
    await expect(street).toHaveValue('Voorbeeldstraat');
    await expect(city).toHaveValue('Amsterdam');
    await expect(page.getByText(text.lookup.filled)).toBeVisible();

    // A postcode with no address: the no-match text shows, and nothing of the old address stays.
    await postcode.fill('9999 ZZ');
    await expect(page.getByText(text.lookup.notFound)).toBeVisible();
    await expect(street).toHaveValue('');
    await expect(city).toHaveValue('');
    await expect(page.getByText(text.lookup.filled)).toHaveCount(0);
    await expectNoAxeViolations(page, `TW-08 Location after a no-match in ${appLocale}`);

    // The Owner's own street survives a later no-match; only what a lookup filled goes.
    await postcode.fill('1234 AB');
    await expect(city).toHaveValue('Amsterdam');
    await street.fill('Mijn eigen straat');
    await postcode.fill('9999 ZZ');
    await expect(page.getByText(text.lookup.notFound)).toBeVisible();
    await expect(city).toHaveValue('');
    await expect(street).toHaveValue('Mijn eigen straat');
  });

  test('AC13: what a lookup filled is emptied when the postcode stops being one', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    await johnOnLocationPage(page, context);
    const text = copy.settingsLocation;
    const postcode = page.getByLabel(text.postcodeLabel, { exact: true });
    const street = page.getByLabel(text.streetLabel);
    const city = page.getByLabel(text.cityLabel);

    await postcode.fill('1234 AB');
    await page.getByLabel(text.houseNumberLabel).fill('1');
    await expect(city).toHaveValue('Amsterdam');
    await expect(page.getByText(text.lookup.filled)).toBeVisible();

    // The API refuses "1234" (422): the note goes and the fields empty, with no message.
    await postcode.fill('1234');
    await expect(page.getByText(text.lookup.filled)).toHaveCount(0);
    await expect(street).toHaveValue('');
    await expect(city).toHaveValue('');
    await expect(page.getByText(text.lookup.notFound)).toHaveCount(0);
    await expect(page.getByText(text.lookup.unavailable)).toHaveCount(0);

    // Emptying the house number does the same after a fresh lookup.
    await postcode.fill('1234 AB');
    await page.getByLabel(text.houseNumberLabel).fill('3');
    await expect(city).toHaveValue('Haarlem');
    await page.getByLabel(text.houseNumberLabel).fill('');
    await expect(page.getByText(text.lookup.filled)).toHaveCount(0);
    await expect(city).toHaveValue('');
    await expectNoAxeViolations(page, `TW-08 Location after the query went blank in ${appLocale}`);
  });

  test('AC13: an answer to a query that has changed since is not used', async ({
    page,
    context,
    messages: copy,
  }) => {
    await johnOnLocationPage(page, context);
    const text = copy.settingsLocation;
    const street = page.getByLabel(text.streetLabel);
    const city = page.getByLabel(text.cityLabel);
    const houseNumber = page.getByLabel(text.houseNumberLabel);
    // The answer for number 1 is held until the Owner has changed the number.
    const hold = await holdLookups(page, 'postcode=1234+AB&houseNumber=1');

    await page.getByLabel(text.postcodeLabel, { exact: true }).fill('1234 AB');
    await houseNumber.fill('1');
    await hold.held;
    await expect(page.getByText(text.lookup.busy)).toBeVisible();
    await houseNumber.fill('12');
    // The old answer arrives right after the change, before the new query is looked up.
    const answered = page.waitForResponse(
      (response) =>
        response.url().includes('/address-lookup') &&
        new URL(response.url()).searchParams.get('houseNumber') === '1',
    );
    hold.release();
    expect((await answered).status()).toBe(200);
    await settle(page);

    // It was for number 1, not 12: nothing is filled in from it. Read at once, not retried: a
    // retrying check would wait for the lookup of number 12 to empty a wrong fill again.
    expect(await street.inputValue()).toBe('');
    expect(await city.inputValue()).toBe('');
    expect(await page.getByText(text.lookup.filled).count()).toBe(0);
    // Number 12 is looked up on its own: no address.
    await expect(page.getByText(text.lookup.notFound)).toBeVisible();
    await expect(street).toHaveValue('');

    // Changed back to number 1, the query is looked up again and fills in.
    await houseNumber.fill('1');
    await expect(street).toHaveValue('Voorbeeldstraat');
  });

  test('AC13: the form stays usable while the lookup runs', async ({
    page,
    context,
    messages: copy,
  }) => {
    await johnOnLocationPage(page, context);
    const text = copy.settingsLocation;
    const hold = await holdLookups(page, 'houseNumber=1');

    await page.getByLabel(text.postcodeLabel, { exact: true }).fill('1234 AB');
    await page.getByLabel(text.houseNumberLabel).fill('1');
    await hold.held;

    await expect(page.getByText(text.lookup.busy)).toBeVisible();
    await expect(page.getByLabel(text.streetLabel)).toHaveAttribute('aria-busy', 'true');
    // Nothing blocks: the Owner can keep typing and saving while the answer is on its way.
    await expect(page.getByLabel(text.nameLabel)).toBeEnabled();
    await expect(page.getByRole('button', { name: text.save })).toBeEnabled();
    await page.getByLabel(text.nameLabel).fill('Typed while looking up');
    await expect(page.getByLabel(text.nameLabel)).toHaveValue('Typed while looking up');

    hold.release();
    await expect(page.getByLabel(text.streetLabel)).toHaveValue('Voorbeeldstraat');
    await expect(page.getByText(text.lookup.busy)).toHaveCount(0);
    await expect(page.getByLabel(text.nameLabel)).toHaveValue('Typed while looking up');
  });

  test('AC14: no-match and unavailable texts; saving by hand works', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const slug = await johnOnLocationPage(page, context);
    const text = copy.settingsLocation;
    const postcode = page.getByLabel(text.postcodeLabel, { exact: true });
    const houseNumber = page.getByLabel(text.houseNumberLabel);
    const street = page.getByLabel(text.streetLabel);
    const city = page.getByLabel(text.cityLabel);

    // No match: the fields stay empty for typing.
    await postcode.fill('9999 ZZ');
    await houseNumber.fill('9');
    await expect(page.getByText(text.lookup.notFound)).toBeVisible();
    await expect(street).toHaveValue('');
    await expect(city).toHaveValue('');
    await expectNoAxeViolations(page, `TW-08 Location with no match in ${appLocale}`);

    // Unavailable: the fake does not answer for 1000 AA (timeout and failure alike). An address an
    // earlier lookup filled in is not kept for a postcode that could not be looked up.
    await postcode.fill('1234 AB');
    await houseNumber.fill('1');
    await expect(street).toHaveValue('Voorbeeldstraat');
    await expect(city).toHaveValue('Amsterdam');
    await postcode.fill('1000 AA');
    await expect(page.getByText(text.lookup.unavailable)).toBeVisible();
    await expect(page.getByText(text.lookup.notFound)).toHaveCount(0);
    await expect(street).toHaveValue('');
    await expect(city).toHaveValue('');
    await expect(page.getByText(text.lookup.filled)).toHaveCount(0);
    await expectNoAxeViolations(page, `TW-08 Location with the lookup unavailable in ${appLocale}`);

    // The Owner fills in the address herself, and saving works.
    await street.fill('Handgetypte straat');
    await city.fill('Ons dorp');
    await page.getByRole('button', { name: text.save }).click();
    await expect(page.getByText(text.saved)).toBeVisible();
    expect((await locationsOf(page, slug))[0]?.address).toEqual({
      postcode: '1000 AA',
      houseNumber: '1',
      houseNumberAddition: null,
      street: 'Handgetypte straat',
      city: 'Ons dorp',
    });
  });

  test('AC14: a lookup used up for the hour (429) reads as unavailable', async ({
    page,
    context,
    messages: copy,
  }) => {
    await johnOnLocationPage(page, context);
    const text = copy.settingsLocation;
    await page.route('**/address-lookup**', (route) =>
      route.fulfill({ status: 429, json: { code: 'rate_limited' } }),
    );

    await page.getByLabel(text.postcodeLabel, { exact: true }).fill('1234 AB');
    await page.getByLabel(text.houseNumberLabel).fill('1');

    await expect(page.getByText(text.lookup.unavailable)).toBeVisible();
    await expect(page.getByLabel(text.streetLabel)).toHaveValue('');
  });

  test('AC15: the postcode and all-or-nothing messages show; 1234ab is stored as 1234 AB', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const slug = await johnOnLocationPage(page, context);
    const text = copy.settingsLocation;
    const postcode = page.getByLabel(text.postcodeLabel, { exact: true });
    const houseNumber = page.getByLabel(text.houseNumberLabel);
    const street = page.getByLabel(text.streetLabel);
    const city = page.getByLabel(text.cityLabel);
    const save = page.getByRole('button', { name: text.save });

    // Not a Dutch postcode, and a house number that is no number.
    await postcode.fill('12345');
    await houseNumber.fill('12a');
    await street.fill('Voorbeeldstraat');
    await city.fill('Amsterdam');
    await save.click();
    await expect(page.getByText(text.errors.postcodeInvalid)).toBeVisible();
    await expect(page.getByText(text.errors.houseNumberInvalid)).toBeVisible();
    await expect(postcode).toHaveAttribute('aria-invalid', 'true');
    await page.mouse.move(0, 0);
    await expectNoAxeViolations(page, `TW-08 Location with address errors in ${appLocale}`);

    // Half an address.
    await postcode.fill('');
    await houseNumber.fill('');
    await save.click();
    await expect(page.getByText(text.errors.addressIncomplete)).toBeVisible();
    await expect(postcode).toHaveAttribute('aria-invalid', 'true');
    await expect(street).not.toHaveAttribute('aria-invalid', 'true');
    await page.mouse.move(0, 0);
    await expectNoAxeViolations(page, `TW-08 Location with a half address in ${appLocale}`);
    expect((await locationsOf(page, slug))[0]?.address).toBeNull();

    // 1234ab is a postcode: it is stored as 1234 AB.
    await postcode.fill('1234ab');
    await houseNumber.fill('1');
    await save.click();
    await expect(page.getByText(text.saved)).toBeVisible();
    expect((await locationsOf(page, slug))[0]?.address).toMatchObject({ postcode: '1234 AB' });
    await expect(page.getByText(text.errors.addressIncomplete)).toHaveCount(0);
    // The pointer stays on the button after the click; axe judges the button at rest.
    await page.mouse.move(0, 0);
    await expectNoAxeViolations(page, `TW-08 Location after saving "1234ab" in ${appLocale}`);
  });

  test('saving without an address removes it', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const slug = await johnOnLocationPage(page, context);
    const text = copy.settingsLocation;
    await page.getByLabel(text.postcodeLabel, { exact: true }).fill('5678 CD');
    await page.getByLabel(text.houseNumberLabel).fill('22');
    await expect(page.getByLabel(text.cityLabel)).toHaveValue('Utrecht');
    await page.getByRole('button', { name: text.save }).click();
    await expect(page.getByText(text.saved)).toBeVisible();
    expect((await locationsOf(page, slug))[0]?.address).not.toBeNull();

    for (const label of [
      text.postcodeLabel,
      text.houseNumberLabel,
      text.streetLabel,
      text.cityLabel,
    ]) {
      await page.getByLabel(label, { exact: true }).fill('');
    }
    await page.getByRole('button', { name: text.save }).click();

    await expect(page.getByText(text.saved)).toBeVisible();
    // The pointer stays on the button after the click; axe judges the button at rest.
    await page.mouse.move(0, 0);
    await expectNoAxeViolations(page, `TW-08 Location after removing the address in ${appLocale}`);
    expect((await locationsOf(page, slug))[0]?.address).toBeNull();
  });
});
