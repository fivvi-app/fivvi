import { readFileSync } from 'node:fs';
import { createDatabase, type DatabaseClient, offers, offerVersions } from '@fivvi/database';
import { addGroupClass, addOffer } from '@fivvi/database/testing';
import {
  createErrorReporter,
  createProductEventCaptureTransport,
  createProductEvents,
} from '@fivvi/observability';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { call, groupClassWorld, setupGroupClassApi } from './group-classes-world.ts';

// F052 (spec #468), ticket #796: the offers API. Synthetic people: John (Owner of John's Gym),
// Sarah (Trainer), Anna de Vries (a client of John's Gym with an account), Mike (Owner of Fit
// Studio). The API runs as the app role, so RLS applies.

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
);

interface VersionBody {
  id: string;
  version: number;
  nameNl: string;
  nameEn: string | null;
  priceCents: number | null;
  vatRateBasisPoints: number | null;
  makeupsPerMonth: number | null;
  termMonths: number | null;
  credits: number | null;
  carryOverLimit: number | null;
  returnsPerMonth: number | null;
  membersOnly: boolean;
  oncePerClient: boolean;
  coveredClasses: { id: string; name: string | null; deleted: boolean; label: string }[] | null;
}

interface OfferBody {
  id: string;
  kind: string;
  creditKind: string | null;
  status: string;
  origin: string;
  runningAgreements: number;
  summary: string;
  cancellation: string;
  currentVersion: VersionBody;
}

interface ProblemBody {
  code: string;
  issues: { path: string; code: string }[];
}

const membership = {
  nameNl: 'Abonnement',
  nameEn: 'Membership',
  priceCents: 7900,
  vatRateBasisPoints: 2100,
  classesPerWeek: 2,
  termMonths: 6,
  billingCycle: 'month',
  endOfTerm: 'stop',
  makeupsPerMonth: 2,
  cutoffMinutes: 720,
};

const groupCreditPlan = {
  kind: 'credit_plan',
  creditKind: 'group',
  nameNl: 'Groepslessen flex',
  priceCents: 6000,
  vatRateBasisPoints: 2100,
  credits: 4,
  billingCycle: 'month',
  minimumTermMonths: 0,
  endOfTerm: 'continue',
  carryOverLimit: 1,
  cutoffMinutes: 720,
};

describe('F052 offers through the API', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 12 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  const setup = (overrides = {}) => setupGroupClassApi(admin, app, overrides);
  const path = (workspaceId: string, offerId?: string) =>
    `/v1/workspaces/${workspaceId}/offers${offerId ? `/${offerId}` : ''}`;
  const dutch = { 'accept-language': 'nl-NL' };
  const english = { 'accept-language': 'en' };

  async function world() {
    const base = await groupClassWorld(admin);
    const { server } = setup();
    const create = (body: unknown, headers?: Record<string, string>, who = base.john) =>
      call(server, 'POST', path(base.gym.id), who, body, headers);
    const created = async (body: Record<string, unknown>) => {
      const response = await create({ kind: 'membership', ...body }, dutch);
      expect(response.status).toBe(201);
      return (await response.json()) as OfferBody;
    };
    const edit = (offerId: string, body: unknown, headers?: Record<string, string>) =>
      call(server, 'PATCH', path(base.gym.id, offerId), base.john, body, headers);
    const read = (offerId: string, headers?: Record<string, string>) =>
      call(server, 'GET', path(base.gym.id, offerId), base.john, undefined, headers);
    const list = (headers?: Record<string, string>) =>
      call(server, 'GET', path(base.gym.id), base.john, undefined, headers);
    return { ...base, server, create, created, edit, read, list };
  }

  const versionsOf = (offerId: string) =>
    admin.db.select().from(offerVersions).where(eq(offerVersions.offerId, offerId));

  describe('create', () => {
    it('AC4: a group credit plan is stored switched off, as version 1; the response reads it back', async () => {
      const { created, gym } = await world();

      const offer = await created(groupCreditPlan);

      expect(offer).toMatchObject({
        kind: 'credit_plan',
        creditKind: 'group',
        status: 'off',
        origin: 'owner',
        runningAgreements: 0,
        currentVersion: {
          version: 1,
          nameNl: 'Groepslessen flex',
          priceCents: 6000,
          vatRateBasisPoints: 2100,
          credits: 4,
          carryOverLimit: 1,
        },
      });
      const [stored] = await admin.db
        .select()
        .from(offers)
        .where(eq(offers.organizationId, gym.id));
      expect(stored).toMatchObject({ id: offer.id, status: 'off', creditKind: 'group' });
    });

    it('AC4: two credit kinds, a fifth kind, a credit kind on a membership and none on credits are refused (422), storing nothing', async () => {
      const { create, gym } = await world();
      const refused = async (body: Record<string, unknown>) => {
        const response = await create(body);
        expect(response.status).toBe(422);
        return (await response.json()) as ProblemBody;
      };

      await refused({ ...groupCreditPlan, creditKind: ['group', 'private'] });
      await refused({ ...groupCreditPlan, kind: 'gift_card' });
      await refused({ ...groupCreditPlan, creditKind: 'open_gym' });
      expect((await refused({ ...groupCreditPlan, creditKind: undefined })).issues).toContainEqual({
        path: 'creditKind',
        code: 'missing',
      });
      expect(
        (await refused({ kind: 'membership', ...membership, creditKind: 'group' })).issues,
      ).toContainEqual({
        path: 'creditKind',
        code: 'not-allowed',
      });
      expect(await admin.db.$count(offers, eq(offers.organizationId, gym.id))).toBe(0);
    });

    it('AC10: an amount outside 1 to 1,000,000 cents, or not a whole number, is refused (422)', async () => {
      const { create, gym } = await world();
      const issuesFor = async (priceCents: unknown) => {
        const response = await create({ kind: 'membership', ...membership, priceCents });
        expect(response.status).toBe(422);
        return ((await response.json()) as ProblemBody).issues;
      };

      expect(await issuesFor(0)).toContainEqual({ path: 'priceCents', code: 'too-low' });
      expect(await issuesFor(1_000_001)).toContainEqual({ path: 'priceCents', code: 'too-high' });
      expect((await issuesFor(79.99)).map(({ path }) => path)).toContain('priceCents');
      expect((await issuesFor('7900')).map(({ path }) => path)).toContain('priceCents');
      expect(await admin.db.$count(offers, eq(offers.organizationId, gym.id))).toBe(0);
      const ok = await create({ kind: 'membership', ...membership, priceCents: 1_000_000 });
      expect(ok.status).toBe(201);
      const cheapest = await create({ kind: 'membership', ...membership, priceCents: 1 });
      expect(cheapest.status).toBe(201);
    });

    it('AC7: a membership with an 18-month term is refused without the confirmation and stored with it', async () => {
      const { create, gym } = await world();
      const body = { kind: 'membership', ...membership, termMonths: 18 };

      const refused = await create(body);
      expect(refused.status).toBe(422);
      expect(((await refused.json()) as ProblemBody).issues).toContainEqual({
        path: 'termMonths',
        code: 'confirmation-required',
      });
      expect(await admin.db.$count(offers, eq(offers.organizationId, gym.id))).toBe(0);

      const stored = await create({ ...body, longTermConfirmed: true });
      expect(stored.status).toBe(201);
      expect(((await stored.json()) as OfferBody).currentVersion.termMonths).toBe(18);
    });

    it('stores the fields of the kind only: a pack keeps its once-per-client and members-only flags, a membership drops them', async () => {
      const { created } = await world();

      const pack = await created({
        kind: 'credit_pack',
        creditKind: 'group',
        nameNl: 'Proefpakket',
        credits: 3,
        validity: { amount: 1, unit: 'month' },
        cutoffMinutes: 720,
        oncePerClient: true,
        membersOnly: true,
        returnsPerMonth: 2,
        makeupsPerMonth: 5,
      });
      const plain = await created({ ...membership, oncePerClient: true, membersOnly: true });

      expect(pack.currentVersion).toMatchObject({
        oncePerClient: true,
        membersOnly: true,
        returnsPerMonth: 2,
        makeupsPerMonth: null,
      });
      expect(plain.currentVersion).toMatchObject({ oncePerClient: false, membersOnly: false });
    });
  });

  describe('read and list', () => {
    it('AC2: the list shows the summary in the language of the caller', async () => {
      const { created, list, read } = await world();
      const offer = await created(membership);

      const nl = (await (await list(dutch)).json()) as OfferBody[];
      const en = (await (await list(english)).json()) as OfferBody[];

      expect(nl.map(({ summary }) => summary)).toEqual([
        '2 lessen per week · 6 maanden · € 79,00 per maand',
      ]);
      expect(en.map(({ summary }) => summary)).toEqual([
        '2 classes a week · 6 months · €79.00 a month',
      ]);
      const one = (await (await read(offer.id, english)).json()) as OfferBody;
      expect(one).toMatchObject({
        id: offer.id,
        cancellation: 'You can cancel free of charge up to 12 hours before.',
      });
    });

    it('the language of the account wins over Accept-Language', async () => {
      const { created, list, john } = await world();
      await created(membership);
      await admin.db.execute(
        sql`update auth_users set preferred_locale = 'en' where id = ${john.id}`,
      );

      const offersList = (await (await list(dutch)).json()) as OfferBody[];

      expect(offersList[0]?.summary).toBe('2 classes a week · 6 months · €79.00 a month');
    });

    it('lists the workspace’s offers by name, with the number of running agreements', async () => {
      const { created, list, gym, other } = await world();
      await created({ ...membership, nameNl: 'Zomer' });
      await created({ ...membership, nameNl: 'Abonnement' });
      await addOffer(admin.db, { workspaceId: other.id });

      const listed = (await (await list()).json()) as OfferBody[];

      expect(listed.map((offer) => offer.currentVersion.nameNl)).toEqual(['Abonnement', 'Zomer']);
      expect(listed.every((offer) => offer.runningAgreements === 0)).toBe(true);
      expect(await admin.db.$count(offers, eq(offers.organizationId, gym.id))).toBe(2);
    });

    it('an offer of another workspace, or none, is 404; a bad ID is 400', async () => {
      const { server, john, other, read } = await world();
      const theirs = await addOffer(admin.db, { workspaceId: other.id });

      expect((await read(theirs.id)).status).toBe(404);
      expect((await read(crypto.randomUUID())).status).toBe(404);
      expect((await read('not-an-id')).status).toBe(400);
      expect(
        (
          await call(server, 'PATCH', path(other.id, theirs.id), john, {
            version: 1,
            ...membership,
          })
        ).status,
      ).toBe(404);
    });
  });

  describe('edit', () => {
    it('AC2: editing the default plan to 7900 cents and 21 % stores a new version with them; the first stays', async () => {
      const { created, edit, list } = await world();
      const draft = await created({ ...membership, priceCents: null, vatRateBasisPoints: null });
      expect(draft.currentVersion).toMatchObject({ priceCents: null, vatRateBasisPoints: null });
      expect(draft.summary).toBe('2 lessen per week · 6 maanden');

      const response = await edit(draft.id, { version: 1, ...membership }, dutch);

      expect(response.status).toBe(200);
      const changed = (await response.json()) as OfferBody;
      expect(changed.currentVersion).toMatchObject({
        version: 2,
        priceCents: 7900,
        vatRateBasisPoints: 2100,
      });
      expect(changed.summary).toBe('2 lessen per week · 6 maanden · € 79,00 per maand');
      const listed = (await (await list(english)).json()) as OfferBody[];
      expect(listed[0]?.summary).toBe('2 classes a week · 6 months · €79.00 a month');
      const stored = (await versionsOf(draft.id)).sort((a, b) => a.version - b.version);
      expect(stored.map(({ version, priceCents }) => [version, priceCents])).toEqual([
        [1, null],
        [2, 7900],
      ]);
    });

    it('AC5: each change is a new version; the version before it is untouched', async () => {
      const { created, edit } = await world();
      const offer = await created(membership);

      const second = (await (
        await edit(offer.id, { version: 1, ...membership, priceCents: 8500, makeupsPerMonth: 1 })
      ).json()) as OfferBody;
      const third = (await (
        await edit(offer.id, { version: 2, ...membership, priceCents: 9000 })
      ).json()) as OfferBody;

      expect(second.currentVersion).toMatchObject({
        version: 2,
        priceCents: 8500,
        makeupsPerMonth: 1,
      });
      expect(third.currentVersion).toMatchObject({ version: 3, priceCents: 9000 });
      const stored = (await versionsOf(offer.id)).sort((a, b) => a.version - b.version);
      expect(
        stored.map(({ version, priceCents, makeupsPerMonth }) => [
          version,
          priceCents,
          makeupsPerMonth,
        ]),
      ).toEqual([
        [1, 7900, 2],
        [2, 8500, 1],
        [3, 9000, 2],
      ]);
      expect(stored[0]?.id).toBe(offer.currentVersion.id);
    });

    it('an edit with a stale expected version is refused (409) with the offer as it is, and stores nothing', async () => {
      const { created, edit } = await world();
      const offer = await created(membership);
      await edit(offer.id, { version: 1, ...membership, priceCents: 8500 });

      const stale = await edit(offer.id, { version: 1, ...membership, priceCents: 9900 }, dutch);

      expect(stale.status).toBe(409);
      const body = (await stale.json()) as { code: string; offer: OfferBody };
      expect(body.code).toBe('offer_changed');
      expect(body.offer.currentVersion).toMatchObject({ version: 2, priceCents: 8500 });
      expect(await versionsOf(offer.id)).toHaveLength(2);
    });

    it('two saves from the same version at once: one is stored, the other is 409', async () => {
      const { created, edit } = await world();
      const offer = await created(membership);

      const statuses = (
        await Promise.all([
          edit(offer.id, { version: 1, ...membership, priceCents: 8500 }),
          edit(offer.id, { version: 1, ...membership, priceCents: 9500 }),
        ])
      ).map((response) => response.status);

      expect(statuses.sort()).toEqual([200, 409]);
      expect(await versionsOf(offer.id)).toHaveLength(2);
    });

    it('the kind never changes, and an edit is the full set of fields: what is left out is empty', async () => {
      const { created, edit } = await world();
      const offer = await created({ ...membership, descriptionNl: 'Twee lessen per week' });

      const response = await edit(offer.id, {
        version: 1,
        kind: 'credit_pack',
        ...membership,
        nameEn: undefined,
      });

      const changed = (await response.json()) as OfferBody;
      expect(changed.kind).toBe('membership');
      expect(changed.currentVersion).toMatchObject({
        nameEn: null,
        descriptionNl: null,
        classesPerWeek: 2,
      });
    });

    it('AC4: a credit offer can get the other credit kind; a membership cannot be given one', async () => {
      const { created, edit } = await world();
      const plan = await created(groupCreditPlan);
      const plain = await created(membership);

      const changed = await edit(plan.id, {
        version: 1,
        ...groupCreditPlan,
        creditKind: 'private',
      });
      const kept = await edit(plan.id, { version: 2, ...groupCreditPlan, creditKind: undefined });
      const refused = await edit(plain.id, { version: 1, ...membership, creditKind: 'group' });

      expect(((await changed.json()) as OfferBody).creditKind).toBe('private');
      expect(((await kept.json()) as OfferBody).creditKind).toBe('private');
      expect(refused.status).toBe(422);
    });

    it('AC10: an edit with a refused value is 422 and stores nothing', async () => {
      const { created, edit } = await world();
      const offer = await created(membership);

      const response = await edit(offer.id, { version: 1, ...membership, priceCents: 79.5 });

      expect(response.status).toBe(422);
      expect(await versionsOf(offer.id)).toHaveLength(1);
    });

    it('an offer that is switched on keeps its price and VAT rate', async () => {
      const { created, edit, gym } = await world();
      const offer = await created(membership);
      await admin.db.update(offers).set({ status: 'on' }).where(eq(offers.id, offer.id));

      const response = await edit(offer.id, {
        version: 1,
        ...membership,
        priceCents: null,
        vatRateBasisPoints: null,
      });

      expect(response.status).toBe(422);
      expect(((await response.json()) as ProblemBody).issues).toContainEqual({
        path: 'priceCents',
        code: 'missing',
      });
      expect(await admin.db.$count(offerVersions, eq(offerVersions.organizationId, gym.id))).toBe(
        1,
      );
    });
  });

  describe('classes', () => {
    it('AC9: a membership limited to "Kracht" and "Mobility" stores both; the summary names them; a class deleted later stays listed', async () => {
      const { created, read, gym } = await world();
      const kracht = await addGroupClass(admin.db, { workspaceId: gym.id, nameNl: 'Kracht' });
      const mobility = await addGroupClass(admin.db, {
        workspaceId: gym.id,
        nameNl: 'Mobility',
        nameEn: 'Mobility EN',
      });

      const offer = await created({ ...membership, coveredClassIds: [kracht.id, mobility.id] });

      expect(offer.currentVersion.coveredClasses?.map(({ id }) => id)).toEqual([
        kracht.id,
        mobility.id,
      ]);
      expect(offer.summary).toBe(
        '2 lessen per week · Kracht, Mobility · 6 maanden · € 79,00 per maand',
      );
      expect(((await (await read(offer.id, english)).json()) as OfferBody).summary).toBe(
        '2 classes a week · Kracht, Mobility EN · 6 months · €79.00 a month',
      );

      await admin.db.execute(
        sql`update group_classes set archived_at = now() where id = ${mobility.id}`,
      );

      const afterDutch = (await (await read(offer.id, dutch)).json()) as OfferBody;
      const afterEnglish = (await (await read(offer.id, english)).json()) as OfferBody;
      expect(afterDutch.summary).toBe(
        '2 lessen per week · Kracht, Mobility (verwijderd) · 6 maanden · € 79,00 per maand',
      );
      expect(afterEnglish.summary).toBe(
        '2 classes a week · Kracht, Mobility EN (deleted) · 6 months · €79.00 a month',
      );
      expect(afterDutch.currentVersion.coveredClasses?.[1]).toMatchObject({
        id: mobility.id,
        deleted: true,
        label: 'Mobility (verwijderd)',
      });
    });

    it('a class of another workspace, a missing one and a limit on private credits are refused (422)', async () => {
      const { create, gym, other } = await world();
      const mine = await addGroupClass(admin.db, { workspaceId: gym.id });
      const theirs = await addGroupClass(admin.db, { workspaceId: other.id });
      const privatePack = {
        kind: 'credit_pack',
        creditKind: 'private',
        nameNl: 'Privé',
        credits: 5,
        validity: { amount: 3, unit: 'month' },
        cutoffMinutes: 1440,
      };

      const foreign = await create({
        kind: 'membership',
        ...membership,
        coveredClassIds: [theirs.id],
      });
      const missing = await create({
        kind: 'membership',
        ...membership,
        coveredClassIds: [mine.id, crypto.randomUUID()],
      });
      const notAllowed = await create({ ...privatePack, coveredClassIds: [mine.id] });
      const empty = await create({ kind: 'membership', ...membership, coveredClassIds: [] });

      for (const response of [foreign, missing, notAllowed, empty])
        expect(response.status).toBe(422);
      expect(((await foreign.json()) as ProblemBody).issues).toEqual([
        { path: 'coveredClassIds', code: 'invalid' },
      ]);
      expect(((await notAllowed.json()) as ProblemBody).issues).toEqual([
        { path: 'coveredClassIds', code: 'not-allowed' },
      ]);
    });
  });

  describe('AC11: access', () => {
    it('Sarah (Trainer) and Anna (a client of the workspace) get 403, Mike 404 on John’s Gym, anonymous 401, on every route', async () => {
      const { server, gym, sarah, mike, annaAccount } = await world();
      const offer = await addOffer(admin.db, { workspaceId: gym.id });
      const routes: [string, string, unknown?][] = [
        ['GET', path(gym.id)],
        ['GET', path(gym.id, offer.id)],
        ['POST', path(gym.id), { kind: 'membership', ...membership }],
        ['PATCH', path(gym.id, offer.id), { version: 1, ...membership }],
      ];

      for (const [method, url, body] of routes) {
        expect(
          (await call(server, method, url, sarah, body)).status,
          `Sarah ${method} ${url}`,
        ).toBe(403);
        expect((await call(server, method, url, mike, body)).status, `Mike ${method} ${url}`).toBe(
          404,
        );
        expect(
          (await call(server, method, url, annaAccount, body)).status,
          `Anna ${method} ${url}`,
        ).toBe(403);
        expect(
          (await call(server, method, url, undefined, body)).status,
          `anonymous ${method} ${url}`,
        ).toBe(401);
      }
      expect(await admin.db.$count(offerVersions, eq(offerVersions.offerId, offer.id))).toBe(1);
      expect(await admin.db.$count(offers, eq(offers.organizationId, gym.id))).toBe(1);
    });

    it('AC13: the four routes are in the contract with the Owner’s capability in x-access', () => {
      const operations = [
        ['/v1/workspaces/{workspaceId}/offers', 'get', 'listOffers'],
        ['/v1/workspaces/{workspaceId}/offers', 'post', 'createOffer'],
        ['/v1/workspaces/{workspaceId}/offers/{offerId}', 'get', 'getOffer'],
        ['/v1/workspaces/{workspaceId}/offers/{offerId}', 'patch', 'updateOffer'],
      ] as const;
      for (const [route, method, operationId] of operations) {
        const operation = contract.paths[route][method];
        expect(operation.operationId).toBe(operationId);
        expect(operation['x-access']).toEqual({
          type: 'workspace',
          capability: 'commerce.offers.manage',
          roles: ['owner'],
          client: 'none',
        });
      }
    });
  });

  describe('AC14: the offer_created event', () => {
    it('carries the workspace ID, the kind and the surface only, nothing of the offer; refusals record nothing', async () => {
      const lines: string[] = [];
      const logs = (['error', 'log', 'warn', 'info'] as const).map((level) =>
        vi
          .spyOn(console, level)
          .mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(' '))),
      );
      const posthog = createProductEventCaptureTransport();
      const productEvents = createProductEvents({
        env: { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://posthog.example.test' },
        transport: posthog,
        errorReporter: createErrorReporter({ env: {} }),
      });
      const { gym, john, sarah } = await groupClassWorld(admin);
      const { server } = setup({ productEvents });
      const secret = {
        nameNl: 'Geheime Prijslijst',
        descriptionNl: 'Alleen voor Anna',
        priceCents: 123456,
      };
      const make = (
        body: unknown,
        who: { id: string } | null = john,
        headers?: Record<string, string>,
      ) => call(server, 'POST', path(gym.id), who ?? undefined, body, headers);

      try {
        // Refusals and invalid bodies record nothing; neither does an app that names no surface.
        await make({ kind: 'membership', ...membership, ...secret }, sarah);
        await make({ kind: 'membership', ...membership, ...secret }, null);
        await make({ kind: 'membership', ...membership, ...secret, priceCents: 0 });
        await make({ kind: 'membership', ...membership, ...secret }, john, {
          authorization: 'Bearer x',
        });
        expect(posthog.events).toEqual([]);

        await make({ kind: 'membership', ...membership, ...secret });
        await make({ ...groupCreditPlan, ...secret, surface: 'ios' }, john, {
          authorization: 'Bearer x',
        });
        await make(
          { kind: 'single_class_pass', ...secret, cutoffMinutes: 720, surface: 'android' },
          john,
          {
            authorization: 'Bearer x',
          },
        );

        const properties = (event?: { properties?: Record<string, unknown> }) =>
          Object.fromEntries(
            Object.entries(event?.properties ?? {}).filter(([key]) => !key.startsWith('$')),
          );
        expect(posthog.events.map(({ event }) => event)).toEqual([
          'offer_created',
          'offer_created',
          'offer_created',
        ]);
        expect(posthog.events.map(properties)).toEqual([
          { workspace_id: gym.id, kind: 'membership', surface: 'web' },
          { workspace_id: gym.id, kind: 'credit_plan', surface: 'ios' },
          { workspace_id: gym.id, kind: 'single_class_pass', surface: 'android' },
        ]);
        expect(posthog.events.every((event) => event.distinct_id === john.id)).toBe(true);
        const everything = JSON.stringify(posthog.events) + lines.join('\n');
        for (const text of ['Geheime Prijslijst', 'Alleen voor Anna', '123456']) {
          expect(everything).not.toContain(text);
        }
      } finally {
        for (const log of logs) log.mockRestore();
      }
    });
  });
});
