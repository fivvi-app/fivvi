import type { Page } from '@playwright/test';
import {
  clientIpHeaders,
  createAccount,
  createGymWithTrainer,
  joinTeam,
  newAddress,
  signInWithSession,
} from './accounts';
import { expect, expectNoAxeViolations, test } from './fixtures';
import { emailsTo, type ReceivedEmail, waitForEmails } from './lettermint';
import { signInWithCode } from './sign-in-page';

// F011 (spec #422): Invite trainer on Trainers (TW-06) and the invitation page. Copy comes from the
// catalogs. Each spec has accounts and workspaces of its own: John is the Owner of John's Gym and
// Sarah a Trainer there; Lisa has no account unless a spec gives her one; Mike owns Fit Studio.
const GYM = "John's Gym";

test.describe('F011 trainer invitations on the web', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  /** John (Owner) and Sarah (Trainer) of John's Gym, and Mike (Owner) of Fit Studio. */
  async function team() {
    const john = newAddress('john');
    const sarah = newAddress('sarah');
    const mike = newAddress('mike');
    await createAccount(john, undefined, 'John');
    await createAccount(sarah, undefined, 'Sarah');
    await createAccount(mike, undefined, 'Mike');
    const slug = await createGymWithTrainer(john, GYM, 'owner');
    await joinTeam(sarah, slug, 'trainer');
    await createGymWithTrainer(mike, 'Fit Studio', 'owner');
    return { john, sarah, mike, slug };
  }

  /** The ID of the workspace the signed-in browser has a team role in. */
  async function workspaceId(page: Page): Promise<string> {
    const [first] = (await (await page.request.get('/api/v1/me/workspaces')).json()) as {
      workspaceId: string;
    }[];
    if (!first) throw new Error('The account has no workspace.');
    return first.workspaceId;
  }

  /** The token of the link in an EM-09 email: the data path from the Owner's click to the invited person. */
  function tokenOf(email: ReceivedEmail): string {
    const token = /\/invitations\/([\w-]+)/.exec(email.text)?.[1];
    if (!token) throw new Error('The email has no invitation link.');
    return token;
  }

  /** John invites `address` through the API from the signed-in browser; returns the invitation's token. */
  async function invite(page: Page, address: string, name = 'Lisa'): Promise<string> {
    const response = await page.request.post(
      `/api/v1/workspaces/${await workspaceId(page)}/trainer-invitations`,
      { data: { name, email: address } },
    );
    expect(response.status()).toBe(201);
    return tokenOf((await waitForEmails(address)).at(-1) as ReceivedEmail);
  }

  test('AC1, AC8: John invites Lisa and sees her pending; the team and the pending address are refused with their texts', async ({
    wording,
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, sarah, slug } = await team();
    const lisa = newAddress('lisa');
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}/trainers`);

    await page.getByRole('button', { name: wording.invite }).click();
    const dialog = page.getByRole('dialog', { name: wording.invite });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(copy.team.invite.localeLabel)).toHaveValue('');
    await expect(
      dialog.getByRole('option', {
        name: copy.team.invite.localeDefault.replace('{language}', copy.clients.languageNames.nl),
      }),
    ).toBeAttached();
    await expectNoAxeViolations(page, `the invite dialog in ${appLocale}`);
    await dialog.getByLabel(copy.team.invite.nameLabel).fill('Lisa');
    await dialog.getByLabel(copy.team.invite.emailLabel).fill(lisa);
    await dialog.getByRole('button', { name: copy.team.invite.submit }).click();

    await expect(page.getByRole('status')).toHaveText(
      copy.team.invite.sent.replace('{name}', 'Lisa'),
    );
    await expect(dialog).toHaveCount(0);
    const row = page.getByRole('row').filter({ hasText: lisa });
    await expect(row).toContainText('Lisa');
    await expect(row.locator('[data-slot="status-pill"]')).toHaveText(copy.team.invitations.status);
    await expect(page.getByRole('row')).toHaveCount(4);
    await expectNoAxeViolations(page, `TW-06 with a pending invitation in ${appLocale}`);
    // The data path: the API lists the invitation the page shows, and the email went out.
    const listed = (await (
      await page.request.get(`/api/v1/workspaces/${await workspaceId(page)}/trainer-invitations`)
    ).json()) as { name: string; email: string }[];
    expect(listed.map(({ name, email }) => ({ name, email }))).toEqual([
      { name: 'Lisa', email: lisa },
    ]);
    await waitForEmails(lisa);

    // AC8: Sarah is on the team already: the dialog says so by name and nothing is sent.
    await page.getByRole('button', { name: wording.invite }).click();
    await dialog.getByLabel(copy.team.invite.nameLabel).fill('S.');
    await dialog.getByLabel(copy.team.invite.emailLabel).fill(sarah);
    await dialog.getByRole('button', { name: copy.team.invite.submit }).click();
    await expect(
      dialog.getByText(copy.team.invite.alreadyOnTeam.replace('{name}', 'Sarah')),
    ).toBeVisible();
    await expectNoAxeViolations(page, `the invite dialog refusing a team member in ${appLocale}`);
    expect(await emailsTo(sarah)).toHaveLength(0);

    // AC8: Lisa has a pending invitation: the dialog offers to send that one again.
    await dialog.getByLabel(copy.team.invite.emailLabel).fill(lisa);
    await dialog.getByRole('button', { name: copy.team.invite.submit }).click();
    await expect(dialog.getByText(copy.team.invite.alreadyInvited)).toBeVisible();
    await dialog.getByRole('button', { name: copy.team.invite.sendAgain }).click();
    await expect(page.getByRole('status')).toHaveText(copy.team.invitations.sentAgain);
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('row')).toHaveCount(4);
    expect(await waitForEmails(lisa, 2)).toHaveLength(2);
  });

  test('AC7: John sends an invitation again, which retires the old link, and withdraws it after the question', async ({
    wording,
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    const lisa = newAddress('lisa');
    await signInWithSession(context, john);
    const first = await invite(page, lisa);
    await page.goto(`/w/${slug}/trainers`);
    const row = page.getByRole('row').filter({ hasText: lisa });

    await row.getByRole('button', { name: copy.team.invitations.sendAgain }).click();

    await expect(page.getByRole('status')).toHaveText(copy.team.invitations.sentAgain);
    const second = tokenOf((await waitForEmails(lisa, 2)).at(-1) as ReceivedEmail);
    expect(second).not.toBe(first);
    expect((await page.request.get(`/api/v1/invitations/${first}`)).status()).toBe(404);
    expect((await page.request.get(`/api/v1/invitations/${second}`)).status()).toBe(200);

    await row.getByRole('button', { name: copy.team.invitations.withdraw }).click();
    const question = page.getByRole('alertdialog');
    await expect(
      question.getByRole('heading', { name: copy.team.invitations.withdrawDialog.title }),
    ).toBeVisible();
    await expect(
      question.getByText(copy.team.invitations.withdrawDialog.body.replace('{email}', lisa)),
    ).toBeVisible();
    await expectNoAxeViolations(page, `the withdraw question in ${appLocale}`);
    // Going back withdraws nothing.
    await question
      .getByRole('button', { name: copy.team.invitations.withdrawDialog.cancel })
      .click();
    await expect(question).toHaveCount(0);
    await expect(row).toHaveCount(1);

    await row.getByRole('button', { name: copy.team.invitations.withdraw }).click();
    await question
      .getByRole('button', { name: copy.team.invitations.withdrawDialog.confirm })
      .click();

    await expect(page.getByRole('status')).toHaveText(
      copy.team.invitations.withdrawn.replace('{name}', 'Lisa'),
    );
    await expect(page.getByRole('row')).toHaveCount(3);
    await expect(page.getByText(lisa)).toHaveCount(0);
    expect((await page.request.get(`/api/v1/invitations/${second}`)).status()).toBe(404);
    await expect(page).toHaveTitle(wording.title);
    await expectNoAxeViolations(page, `TW-06 after a withdrawal in ${appLocale}`);
  });

  test('AC3: Lisa opens the link signed out, signs in with the code, accepts and lands in John’s Gym', async ({
    wording,
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    const lisa = newAddress('lisa');
    await signInWithSession(context, john);
    const token = await invite(page, lisa);
    await context.clearCookies();

    await page.goto(`/invitations/${token}`);

    // Signed out with a valid invitation: sign-in first, then back to the invitation.
    await expect(page).toHaveURL(/\/login\?returnTo=%2Finvitations%2F/);
    // Lisa has EM-09 already, so the sign-in code is her second email.
    await signInWithCode(page, copy, lisa, 2);
    await expect(page).toHaveURL(`/invitations/${token}`);
    await expect(
      page.getByRole('heading', { level: 1, name: copy.invitation.title }),
    ).toBeVisible();
    await expect(page.getByText(wording.intro('John', GYM))).toBeVisible();
    await expect(page).toHaveTitle(copy.invitation.title);
    await expectNoAxeViolations(page, `the invitation page in ${appLocale}`);

    await page.getByRole('button', { name: copy.invitation.accept }).click();

    // A Trainer's home is Mijn dag (F013, F014): the invitation opens `/w/{slug}`, which remembers
    // the workspace and sends her there, inside John's Gym's frame.
    await expect(page).toHaveURL('/me/day');
    await expect(page.getByRole('heading', { level: 1, name: copy.myDay.title })).toBeVisible();
    await expect(page.getByText(`${GYM} · ${copy.roles.trainer}`)).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: copy.workspaceNav.label })
        .getByRole('link', { name: copy.workspaceNav.calendar, exact: true }),
    ).toHaveAttribute('href', `/w/${slug}/calendar`);
    // The data path: Lisa is on the team and her invitation left John's list.
    const members = (await (await page.request.get(`/api/v1/me/workspaces`)).json()) as {
      name: string;
      role: string;
    }[];
    expect(members.map(({ name, role }) => ({ name, role }))).toEqual([
      { name: GYM, role: 'trainer' },
    ]);
    await context.clearCookies();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}/trainers`);
    await expect(page.getByRole('row').filter({ hasText: lisa })).toContainText(copy.roles.trainer);
    await expect(
      page.locator('[data-slot="status-pill"]', { hasText: copy.team.invitations.status }),
    ).toHaveCount(0);
  });

  test('#1413: the sign-in opens with Lisa’s address filled in, with none of it in the URL, and another address still signs in', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, mike } = await team();
    const lisa = newAddress('lisa');
    await signInWithSession(context, john);
    const token = await invite(page, lisa);
    await context.clearCookies();

    await page.goto(`/invitations/${token}`);

    await expect(page).toHaveURL(/\/login\?returnTo=%2Finvitations%2F/);
    const field = page.getByLabel(copy.signIn.emailLabel);
    await expect(field).toHaveValue(lisa);
    // The address is read on the server from the token: it is not in the link or the page's URL.
    const url = decodeURIComponent(page.url());
    expect(url).not.toContain(lisa);
    expect(url).not.toContain(lisa.split('@')[0] as string);
    expect(token).not.toContain('@');
    await expectNoAxeViolations(page, `the invitation sign-in in ${appLocale}`);

    // The field stays editable: Mike signs in with his own address and sees the wrong-account text.
    await field.fill(mike);
    await expect(field).toHaveValue(mike);
    await signInWithCode(page, copy, mike);
    await expect(page).toHaveURL(`/invitations/${token}`);
    await expect(
      page.getByText(
        copy.invitation.wrongAccount.replace('{maskedEmail}', `l***@${lisa.split('@')[1]}`),
      ),
    ).toBeVisible();
  });

  test('#1413: the sign-in opens empty without an invitation, and for a withdrawn, an unknown or no token', async ({
    page,
    context,
    messages: copy,
  }) => {
    const { john } = await team();
    const lisa = newAddress('lisa');
    await signInWithSession(context, john);
    const withdrawn = await invite(page, lisa);
    const id = await workspaceId(page);
    const [pending] = (await (
      await page.request.get(`/api/v1/workspaces/${id}/trainer-invitations`)
    ).json()) as { id: string }[];
    if (!pending) throw new Error('The invitation is not listed.');
    expect(
      (
        await page.request.delete(`/api/v1/workspaces/${id}/trainer-invitations/${pending.id}`)
      ).status(),
    ).toBe(204);
    const open = await invite(page, newAddress('tom'), 'Tom');
    await context.clearCookies();

    const field = page.getByLabel(copy.signIn.emailLabel);
    for (const returnTo of [
      `/invitations/${withdrawn}`,
      '/invitations/not-a-token',
      '/invitations',
      '/home',
    ]) {
      await page.goto(`/login?${new URLSearchParams({ returnTo })}`);
      await expect(field, returnTo).toHaveValue('');
    }
    await page.goto('/login');
    await expect(field).toHaveValue('');
    // A valid invitation is the only one that fills it in.
    await page.goto(`/login?${new URLSearchParams({ returnTo: `/invitations/${open}` })}`);
    await expect(field).not.toHaveValue('');
  });

  test('AC5: Lisa declines and sees that she did; nothing is left on John’s list', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await team();
    const lisa = newAddress('lisa');
    await createAccount(lisa, undefined, 'Lisa');
    await signInWithSession(context, john);
    const token = await invite(page, lisa);
    await context.clearCookies();
    await signInWithSession(context, lisa);

    await page.goto(`/invitations/${token}`);
    await page.getByRole('button', { name: copy.invitation.decline }).click();

    await expect(page.getByText(copy.invitation.declined)).toBeVisible();
    await expect(page.getByRole('button', { name: copy.invitation.accept })).toHaveCount(0);
    await expectNoAxeViolations(page, `the declined invitation in ${appLocale}`);
    await context.clearCookies();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}/trainers`);
    await expect(page.getByRole('row')).toHaveCount(3);
    await expect(page.getByText(lisa)).toHaveCount(0);
  });

  test('AC6: a link that is no longer valid and another account each show their text', async ({
    page,
    context,
    browser,
    baseURL,
    appLocale,
    messages: copy,
  }) => {
    const { john, mike } = await team();
    const lisa = newAddress('lisa');
    await signInWithSession(context, john);
    const token = await invite(page, lisa);
    const id = await workspaceId(page);
    const [pending] = (await (
      await page.request.get(`/api/v1/workspaces/${id}/trainer-invitations`)
    ).json()) as { id: string }[];
    if (!pending) throw new Error('The invitation is not listed.');
    const invitationId = pending.id;
    await context.clearCookies();

    // Another account (Mike, signed in) reads the masked address and can not answer.
    await signInWithSession(context, mike);
    await page.goto(`/invitations/${token}`);
    await expect(
      page.getByText(
        copy.invitation.wrongAccount.replace('{maskedEmail}', `l***@${lisa.split('@')[1]}`),
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: copy.invitation.accept })).toHaveCount(0);
    await expectNoAxeViolations(page, `the invitation page of another account in ${appLocale}`);

    // Signing out brings the visitor to sign in, and back to this invitation after it.
    await page.getByRole('button', { name: copy.invitation.signOutAndContinue }).click();
    await expect(page).toHaveURL(/\/login\?returnTo=%2Finvitations%2F/);
    // Lisa, whose address it is, signs in (her second email: EM-09 came first) and is back at the
    // invitation, which she can answer.
    await signInWithCode(page, copy, lisa, 2);
    await expect(page).toHaveURL(`/invitations/${token}`);
    await expect(page.getByRole('button', { name: copy.invitation.accept })).toBeVisible();

    // John withdraws the invitation: its link now says it is no longer valid, to anyone.
    const johns = await browser.newContext({ baseURL, extraHTTPHeaders: clientIpHeaders() });
    try {
      await signInWithSession(johns, john);
      expect(
        (
          await johns.request.delete(`/api/v1/workspaces/${id}/trainer-invitations/${invitationId}`)
        ).status(),
      ).toBe(204);
    } finally {
      await johns.close();
    }
    await context.clearCookies();
    for (const link of [token, 'not-a-token']) {
      await page.goto(`/invitations/${link}`);
      await expect(page).toHaveURL(`/invitations/${link}`);
      await expect(page.getByText(copy.invitation.noLongerValid)).toBeVisible();
      await expect(page.getByRole('button', { name: copy.invitation.accept })).toHaveCount(0);
    }
    await expectNoAxeViolations(page, `the no-longer-valid invitation page in ${appLocale}`);
  });

  test('AC9: Sarah sees no invite button and no pending rows, and the API refuses her', async ({
    wording,
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, sarah, slug } = await team();
    const lisa = newAddress('lisa');
    await signInWithSession(context, john);
    await invite(page, lisa);
    await context.clearCookies();
    await signInWithSession(context, sarah);

    await page.goto(`/w/${slug}`);
    // Sarah has no Trainers page at all (F003); the invite tools are not anywhere she can go.
    await expect(page.getByRole('button', { name: wording.invite })).toHaveCount(0);
    await page.goto(`/w/${slug}/trainers`);
    await expect(
      page.getByRole('heading', { level: 1, name: copy.noPermission.title }),
    ).toBeVisible();
    await expect(page.getByText(lisa)).toHaveCount(0);
    await expect(page.getByRole('button', { name: wording.invite })).toHaveCount(0);
    const id = await workspaceId(page);
    expect((await page.request.get(`/api/v1/workspaces/${id}/trainer-invitations`)).status()).toBe(
      403,
    );
    await expectNoAxeViolations(
      page,
      `TW-06 for a Trainer with an invitation pending in ${appLocale}`,
    );
  });
});
