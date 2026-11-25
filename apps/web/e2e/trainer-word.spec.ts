import {
  formattingLocales,
  messages,
  TRAINER_WORDS,
  type TrainerWord,
  trainerWordForms,
} from '@fivvi/i18n';
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
import { type ReceivedEmail, waitForEmails } from './lettermint';
import { wordingOf } from './trainer-wording';

// F068 (spec #588): the workspace's word for its trainers on the trainer web. TW-08 Settings →
// General → Woordkeuze, where the Owner chooses it (AC1, AC10, AC11), and the screens that say it
// (AC1, AC3, AC4, AC11). Copy comes from the catalogs. Each spec has accounts and workspaces of its
// own (see language.spec.ts). John owns John's Gym, Sarah is a Trainer there.
const GYM = "John's Gym";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  defaultLocale: string;
  timeZone: string;
  trainerWord: string;
}

/** The ID of the workspace `name` of the signed-in person, from the API. */
async function workspaceIdOf(page: Page, name: string): Promise<string> {
  const workspaces = (await (await page.request.get('/api/v1/me/workspaces')).json()) as {
    workspaceId: string;
    name: string;
  }[];
  const workspaceId = workspaces.find((workspace) => workspace.name === name)?.workspaceId;
  if (!workspaceId) throw new Error(`No workspace ${name}.`);
  return workspaceId;
}

/** The workspace as the API holds it. */
async function workspaceOf(page: Page, workspaceId: string): Promise<Workspace> {
  return (await (await page.request.get(`/api/v1/workspaces/${workspaceId}`)).json()) as Workspace;
}

/** John, or any Owner, sets the word of a workspace through the API, as the card does. */
async function setWord(page: Page, workspaceId: string, trainerWord: TrainerWord) {
  const response = await page.request.patch(`/api/v1/workspaces/${workspaceId}`, {
    data: { trainerWord },
  });
  expect(response.status()).toBe(200);
}

test.describe('F068 the workspace’s word', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  /** John (Owner) and Sarah (Trainer) of John's Gym. */
  async function gym() {
    const john = newAddress('john');
    const sarah = newAddress('sarah');
    await createAccount(john, undefined, 'John');
    await createAccount(sarah, undefined, 'Sarah');
    const slug = await createGymWithTrainer(john, GYM, 'owner');
    await joinTeam(sarah, slug, 'trainer');
    return { john, sarah, slug };
  }

  test('AC1: John chooses instructeur on Woordkeuze; it is saved for John’s Gym and the card shows it chosen after a reload', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await gym();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}/settings/general`);

    const card = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole('heading', { level: 2, name: copy.settingsWording.title }) });
    await expect(card).toBeVisible();
    // The text names the workspace.
    await expect(
      card.getByText(copy.settingsWording.help.replace('{workspace}', GYM)),
    ).toBeVisible();
    // Four choices, each with its singular and plural in the reader's language; a new workspace starts on trainer.
    await expect(card.getByRole('radio')).toHaveCount(4);
    for (const choice of TRAINER_WORDS) {
      const { Word, words } = trainerWordForms(choice, appLocale);
      const radio = card.getByRole('radio', { name: `${Word} ${words}` });
      await expect(radio).toBeAttached();
      if (choice === 'trainer') await expect(radio).toBeChecked();
      else await expect(radio).not.toBeChecked();
    }
    await expectNoAxeViolations(page, `Woordkeuze in ${appLocale}`);

    const workspaceId = await workspaceIdOf(page, GYM);
    expect((await workspaceOf(page, workspaceId)).trainerWord).toBe('trainer');

    const instructeur = trainerWordForms('instructeur', appLocale);
    await card.getByText(instructeur.Word, { exact: true }).click();
    await expect(card.getByText(copy.settingsWording.saved)).toBeVisible();
    await expect(
      card.getByRole('radio', { name: `${instructeur.Word} ${instructeur.words}` }),
    ).toBeChecked();
    await expectNoAxeViolations(page, `Woordkeuze after a choice in ${appLocale}`);

    // The data path: the API holds it for John's Gym, and the card shows it after a reload.
    expect((await workspaceOf(page, workspaceId)).trainerWord).toBe('instructeur');
    await page.reload();
    await expect(
      page.getByRole('radio', { name: `${instructeur.Word} ${instructeur.words}` }),
    ).toBeChecked();
    await expect(page.getByRole('radio', { checked: true })).toHaveCount(1);
  });

  test('AC11: John changes the word again; the new choice is saved and nothing else in Algemeen changes', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await gym();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}/settings/general`);
    const workspaceId = await workspaceIdOf(page, GYM);
    const before = await workspaceOf(page, workspaceId);
    const choose = async (choice: (typeof TRAINER_WORDS)[number]) => {
      const { Word, words } = trainerWordForms(choice, appLocale);
      await page.getByText(Word, { exact: true }).click();
      await expect(page.getByRole('radio', { name: `${Word} ${words}` })).toBeChecked();
      await expect(page.getByText(copy.settingsWording.saved)).toBeVisible();
    };

    await choose('instructeur');
    expect((await workspaceOf(page, workspaceId)).trainerWord).toBe('instructeur');
    await choose('docent');
    await choose('coach');

    // The name field of the same page keeps its value; the workspace keeps its name, URL name, language and time zone.
    await expect(page.getByLabel(copy.settingsGeneral.nameLabel)).toHaveValue(GYM);
    const after = await workspaceOf(page, workspaceId);
    expect(after).toEqual({ ...before, trainerWord: 'coach' });
    await page.reload();
    await expect(page.getByRole('radio', { checked: true })).toHaveAccessibleName(
      `${trainerWordForms('coach', appLocale).Word} ${trainerWordForms('coach', appLocale).words}`,
    );
    await expect(page.getByLabel(copy.settingsGeneral.nameLabel)).toHaveValue(GYM);
    await expectNoAxeViolations(page, `Woordkeuze after another choice in ${appLocale}`);
  });

  test('@permission AC10: Sarah (Trainer) can’t change the word: Woordkeuze isn’t editable for her, and the route answers 403', async ({
    page,
    context,
    browser,
    baseURL,
    appLocale,
    messages: copy,
  }) => {
    const { john, sarah, slug } = await gym();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}/settings/general`);
    const workspaceId = await workspaceIdOf(page, GYM);
    await page.getByText(trainerWordForms('docent', appLocale).Word, { exact: true }).click();
    await expect(page.getByText(copy.settingsWording.saved)).toBeVisible();

    const sarahsBrowser = await browser.newContext({
      baseURL,
      extraHTTPHeaders: clientIpHeaders(),
    });
    try {
      await signInWithSession(sarahsBrowser, sarah);
      const sarahsPage = await sarahsBrowser.newPage();
      // She has no Settings in her navigation; its URL shows the no-permission page and no choice.
      await sarahsPage.goto(`/w/${slug}`);
      await expect(
        sarahsPage
          .getByRole('navigation', { name: copy.workspaceNav.label })
          .getByRole('link', { name: copy.workspaceNav.settings, exact: true }),
      ).toHaveCount(0);
      await sarahsPage.goto(`/w/${slug}/settings/general`);
      await expect(
        sarahsPage.getByRole('heading', { level: 1, name: copy.noPermission.title }),
      ).toBeVisible();
      await expect(sarahsPage.getByRole('radio')).toHaveCount(0);
      await expectNoAxeViolations(sarahsPage, `Sarah on the General URL in ${appLocale}`);

      // The API lets her read the word and refuses to change it.
      expect((await workspaceOf(sarahsPage, workspaceId)).trainerWord).toBe('docent');
      const refused = await sarahsPage.request.patch(`/api/v1/workspaces/${workspaceId}`, {
        data: { trainerWord: 'coach' },
      });
      expect(refused.status()).toBe(403);
      expect((await workspaceOf(page, workspaceId)).trainerWord).toBe('docent');
    } finally {
      await sarahsBrowser.close();
    }
  });

  test('AC1: John chose instructeur; the sidebar, the Trainers page, its role labels and its dialogs say it from the next screen on', async ({
    page,
    context,
    browser,
    baseURL,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await gym();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}/settings/general`);
    const workspaceId = await workspaceIdOf(page, GYM);
    const wording = wordingOf(appLocale, 'instructeur');
    const instructeur = trainerWordForms('instructeur', appLocale);
    // He chooses it on Woordkeuze; the next screen is the Trainers page.
    await page.getByText(instructeur.Word, { exact: true }).click();
    await expect(page.getByText(copy.settingsWording.saved)).toBeVisible();
    await page
      .getByRole('navigation', { name: copy.workspaceNav.label })
      .getByRole('link', { name: wording.nav })
      .click();

    await expect(page.getByRole('heading', { level: 1, name: wording.title })).toBeVisible();
    await expect(page).toHaveTitle(wording.title);
    await expect(
      page.getByRole('navigation', { name: copy.workspaceNav.label }).getByRole('link', {
        name: wording.nav,
      }),
    ).toHaveAttribute('aria-current', 'page');
    // The role label (the menu), the badge and the invite button.
    const menu = page.getByLabel(copy.team.roleMenu.replace('{name}', 'Sarah'));
    await expect(menu.locator('option')).toHaveText([copy.roles.owner, wording.roleLabel]);
    await expect(
      page.getByRole('row').filter({ hasText: 'Sarah' }).locator('[data-slot="status-pill"]'),
    ).toHaveText(wording.badge);
    await expect(page.getByRole('button', { name: wording.invite })).toBeVisible();
    await expectNoAxeViolations(page, `Trainers with instructeur in ${appLocale}`);

    // The invite dialog.
    await page.getByRole('button', { name: wording.invite }).click();
    await expect(page.getByRole('dialog', { name: wording.invite })).toBeVisible();
    await expectNoAxeViolations(page, `the invite dialog with instructeur in ${appLocale}`);
    await page.getByRole('button', { name: copy.team.invite.cancel }).click();

    // The remove dialog.
    await page.getByRole('button', { name: copy.team.remove }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText(wording.removeBody('Sarah', GYM))).toBeVisible();
    await expectNoAxeViolations(page, `the remove dialog with instructeur in ${appLocale}`);
    await dialog.getByRole('button', { name: copy.team.removeDialog.cancel }).click();

    // The role changed: Sarah an Owner, and back to the word. Then John, with a second Owner, steps down.
    await menu.selectOption('owner');
    await dialog.getByRole('button', { name: copy.team.makeOwnerDialog.confirm }).click();
    await expect(page.getByRole('status')).toHaveText(
      copy.team.roleChanged.owner.replace('{name}', 'Sarah'),
    );
    await expect(menu).toHaveValue('owner');
    await menu.selectOption('trainer');
    await expect(page.getByRole('status')).toHaveText(wording.roleChanged('Sarah'));
    await expect(menu).toHaveValue('trainer');
    await menu.selectOption('owner');
    await dialog.getByRole('button', { name: copy.team.makeOwnerDialog.confirm }).click();
    await expect(menu).toHaveValue('owner');
    await page.getByLabel(copy.team.roleMenu.replace('{name}', 'John')).selectOption('trainer');
    await expect(dialog.getByRole('heading', { name: wording.stepDownTitle })).toBeVisible();
    await expect(dialog.getByRole('button', { name: wording.stepDownConfirm })).toBeVisible();
    await expectNoAxeViolations(page, `the step-down dialog with instructeur in ${appLocale}`);
    await dialog.getByRole('button', { name: copy.team.stepDownDialog.cancel }).click();

    // The invitation page, as the invited person reads it, says it too.
    const lisa = newAddress('lisa');
    await createAccount(lisa, undefined, 'Lisa');
    const invited = await page.request.post(
      `/api/v1/workspaces/${workspaceId}/trainer-invitations`,
      {
        data: { name: 'Lisa', email: lisa },
      },
    );
    expect(invited.status()).toBe(201);
    const mail = (await waitForEmails(lisa)).at(-1) as ReceivedEmail;
    const token = /\/invitations\/([\w-]+)/.exec(mail.text)?.[1];
    expect(token).toBeDefined();
    const lisasContext = await browser.newContext({
      baseURL,
      locale: formattingLocales[appLocale],
      extraHTTPHeaders: clientIpHeaders(),
    });
    try {
      await signInWithSession(lisasContext, lisa);
      const lisasPage = await lisasContext.newPage();
      await lisasPage.goto(`/invitations/${token}`);
      await expect(lisasPage.getByText(wording.intro('John', GYM))).toBeVisible();
      await expectNoAxeViolations(lisasPage, `the invitation with instructeur in ${appLocale}`);
    } finally {
      await lisasContext.close();
    }
  });

  test('AC3: the language is the reader’s, the word the workspace’s: instructeur in Dutch and instructor in English, in the same place on the same screen', async ({
    page,
    context,
    browser,
    baseURL,
    appLocale,
    otherLocale,
    messages: copy,
  }) => {
    const { john, slug } = await gym();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    await setWord(page, await workspaceIdOf(page, GYM), 'instructeur');

    const own = wordingOf(appLocale, 'instructeur');
    const other = wordingOf(otherLocale, 'instructeur');
    await page.goto(`/w/${slug}/trainers`);
    const ownLinks = page
      .getByRole('navigation', { name: copy.workspaceNav.label })
      .getByRole('link');
    const position = (await ownLinks.allTextContents()).indexOf(own.nav);
    expect(position).toBeGreaterThanOrEqual(0);
    await expect(page.getByRole('heading', { level: 1, name: own.title })).toBeVisible();

    // The same person reading in the other language: another word for the same choice, at the same place.
    const reader = await browser.newContext({
      baseURL,
      locale: formattingLocales[otherLocale],
      extraHTTPHeaders: clientIpHeaders(),
    });
    try {
      await signInWithSession(reader, john);
      const otherPage = await reader.newPage();
      await otherPage.goto(`/w/${slug}/trainers`);
      const otherLinks = otherPage
        .getByRole('navigation', { name: messages[otherLocale].workspaceNav.label })
        .getByRole('link');
      await expect(otherPage.getByRole('heading', { level: 1, name: other.title })).toBeVisible();
      expect((await otherLinks.allTextContents())[position]).toBe(other.nav);
      expect(own.forms.word).not.toBe(other.forms.word);
      await expectNoAxeViolations(otherPage, `Trainers read in ${otherLocale}`);
    } finally {
      await reader.close();
    }
  });

  test('AC4: Sarah in John’s Gym (instructeur) and Yoga Loft (docent): each workspace shows its own word, also right after she switches scope, and her role is Trainer in both', async ({
    page,
    context,
    browser,
    baseURL,
    appLocale,
    messages: copy,
  }) => {
    const { john, sarah, slug } = await gym();
    const yara = newAddress('yara');
    await createAccount(yara, undefined, 'Yara');
    const yogaSlug = await createGymWithTrainer(yara, 'Yoga Loft', 'owner');
    await joinTeam(sarah, yogaSlug, 'trainer');
    // Each Owner chooses the word of their workspace.
    for (const [owner, name, word] of [
      [john, GYM, 'instructeur'],
      [yara, 'Yoga Loft', 'docent'],
    ] as const) {
      const ownersBrowser = await browser.newContext({
        baseURL,
        extraHTTPHeaders: clientIpHeaders(),
      });
      try {
        await signInWithSession(ownersBrowser, owner);
        const ownersPage = await ownersBrowser.newPage();
        await ownersPage.goto('/');
        await setWord(ownersPage, await workspaceIdOf(ownersPage, name), word);
      } finally {
        await ownersBrowser.close();
      }
    }
    await signInWithSession(context, sarah);
    const gymLabel = `${GYM} · ${wordingOf(appLocale, 'instructeur').forms.Word}`;
    const yogaLabel = `Yoga Loft · ${wordingOf(appLocale, 'docent').forms.Word}`;

    await page.goto(`/w/${slug}`);
    await expect(page.getByRole('button', { name: gymLabel })).toBeVisible();
    await expect(page.getByText(yogaLabel)).toHaveCount(0);
    // The menu lists each workspace with its own word as her role.
    await page.getByRole('button', { name: gymLabel }).click();
    await expect(page.getByRole('menuitemradio', { name: gymLabel })).toBeChecked();
    await expect(page.getByRole('menuitemradio', { name: yogaLabel })).toBeVisible();
    await expectNoAxeViolations(page, `the scope menu with two words in ${appLocale}`);

    // Right after switching scope the frame says the other workspace's word.
    await page.getByRole('menuitemradio', { name: yogaLabel }).click();
    // A Trainer's home is Mijn dag, in the frame of the workspace she opened.
    await expect(page).toHaveURL('/me/day');
    await expect(page.getByRole('button', { name: yogaLabel })).toBeVisible();
    await expect(page.getByText(gymLabel)).toHaveCount(0);
    // And in John's Gym again (its Clients page, since her home is wherever she was last), its own word.
    await page.goto(`/w/${slug}/clients`);
    await expect(page.getByRole('button', { name: gymLabel })).toBeVisible();
    await expect(page.getByText(yogaLabel)).toHaveCount(0);

    // The role is Trainer in both; the word is only what is shown. A screen with no workspace uses neither.
    const me = (await (await page.request.get('/api/v1/me')).json()) as {
      workspaces: { name: string; role: string; trainerWord: string }[];
    };
    expect(
      me.workspaces.map(({ name, role, trainerWord }) => [name, role, trainerWord]).sort(),
    ).toEqual(
      [
        [GYM, 'trainer', 'instructeur'],
        ['Yoga Loft', 'trainer', 'docent'],
      ].sort(),
    );
    await page.goto('/me/profile');
    await expect(page.getByRole('listitem')).toHaveText([
      `${GYM}${copy.roles.trainer}`,
      `Yoga Loft${copy.roles.trainer}`,
    ]);
  });

  test('AC11: John changes the word again; every web screen follows and nothing else changes', async ({
    page,
    context,
    appLocale,
    messages: copy,
  }) => {
    const { john, slug } = await gym();
    await signInWithSession(context, john);
    await page.goto(`/w/${slug}`);
    const workspaceId = await workspaceIdOf(page, GYM);
    await setWord(page, workspaceId, 'instructeur');
    const before = await workspaceOf(page, workspaceId);
    const teamBefore = await (
      await page.request.get(`/api/v1/workspaces/${workspaceId}/team-members`)
    ).json();

    await page.goto(`/w/${slug}/settings/general`);
    const coach = wordingOf(appLocale, 'coach');
    const nav = page.getByRole('navigation', { name: copy.workspaceNav.label });
    await expect(
      nav.getByRole('link', { name: wordingOf(appLocale, 'instructeur').nav }),
    ).toBeVisible();
    await page.getByText(coach.forms.Word, { exact: true }).click();
    await expect(page.getByText(copy.settingsWording.saved)).toBeVisible();
    // The screen the choice was made on follows once the server answers again, and so does the next one.
    await expect(nav.getByRole('link', { name: coach.nav })).toBeVisible();
    await page.goto(`/w/${slug}/trainers`);
    await expect(page.getByRole('heading', { level: 1, name: coach.title })).toBeVisible();
    await expect(page.getByRole('button', { name: coach.invite })).toBeVisible();
    // John is the Owner: the switcher keeps his Owner label, never the workspace's word.
    await expect(page.getByText(`${GYM} · ${copy.roles.owner}`)).toBeVisible();
    await expect(page.getByText(`${GYM} · ${coach.forms.Word}`)).toHaveCount(0);
    await expectNoAxeViolations(page, `Trainers after changing to coach in ${appLocale}`);

    // Nothing else changed: the workspace, its team and Sarah's role.
    expect(await workspaceOf(page, workspaceId)).toEqual({ ...before, trainerWord: 'coach' });
    expect(
      await (await page.request.get(`/api/v1/workspaces/${workspaceId}/team-members`)).json(),
    ).toEqual(teamBefore);
  });
});
