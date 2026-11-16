import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cloneTemplateDatabase,
  createTestDatabase,
  type TestDatabase,
} from '@fivvi/testing/database';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addOfferVersion,
  createDatabase,
  createOffer,
  createTenantScopes,
  createWorkspaceWithOwner,
  type DatabaseClient,
  type DatabaseExecutor,
  listOffers,
  listOfferVersions,
  type NewOffer,
  offers,
  offerVersions,
  type WorkspaceScope,
} from '../src/index.ts';
import { migrationsFolder, runMigrations } from '../src/migrate.ts';
import { executorOf } from '../src/tenant-scope.ts';
import {
  addOffer,
  addTeamRole,
  createAccount,
  createWorkspace,
  testDefaultOffers,
} from '../src/testing/index.ts';

// The offers and their immutable versions (F052, spec #468, ticket #784): the tables, the default
// plans of a new workspace, the backfill of the existing ones and the repository functions, as the
// app role where RLS applies. Isolation over both tables is covered by the RLS suite, which has a
// factory for each (`rls.integration.test.ts`).

const DEFAULTS = {
  defaultLocale: 'nl-NL',
  timeZone: 'Europe/Amsterdam',
  ownerTrains: false,
} as const;

async function rows<T>(db: DatabaseExecutor, query: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute(query)).rows as T[];
}

/** What AC1 lists for the three default plans, as the database holds them (current version joined). */
const AC1_DEFAULTS = [
  {
    default_plan: 'membership',
    kind: 'membership',
    credit_kind: null,
    status: 'off',
    origin: 'default',
    name_nl: 'Abonnement',
    name_en: 'Membership',
    price_cents: null,
    vat_rate_basis_points: null,
    classes_per_week: 2,
    term_months: 6,
    billing_cycle: 'month',
    makeups_per_month: 2,
    cutoff_minutes: 720,
    end_of_term: 'stop',
    renewal_window_days: 30,
    covered_class_ids: null,
    credits: null,
    validity_amount: null,
    validity_unit: null,
    minimum_term_months: null,
    carry_over_limit: null,
    returns_per_month: null,
  },
  {
    default_plan: 'group_credit_pack',
    kind: 'credit_pack',
    credit_kind: 'group',
    status: 'off',
    origin: 'default',
    name_nl: 'Groepscreditpakket',
    name_en: 'Group credit pack',
    price_cents: null,
    vat_rate_basis_points: null,
    classes_per_week: null,
    term_months: null,
    billing_cycle: null,
    makeups_per_month: null,
    cutoff_minutes: 720,
    end_of_term: null,
    renewal_window_days: 30,
    covered_class_ids: null,
    credits: 10,
    validity_amount: 3,
    validity_unit: 'month',
    minimum_term_months: null,
    carry_over_limit: null,
    returns_per_month: null,
  },
  {
    default_plan: 'private_credit_plan',
    kind: 'credit_plan',
    credit_kind: 'private',
    status: 'off',
    origin: 'default',
    name_nl: 'Privécreditabonnement',
    name_en: 'Private credit plan',
    price_cents: null,
    vat_rate_basis_points: null,
    classes_per_week: null,
    term_months: null,
    billing_cycle: 'month',
    makeups_per_month: null,
    cutoff_minutes: 1440,
    end_of_term: 'stop',
    renewal_window_days: 30,
    covered_class_ids: null,
    credits: 4,
    validity_amount: null,
    validity_unit: null,
    minimum_term_months: 3,
    carry_over_limit: 0,
    returns_per_month: 2,
  },
];

function defaultsOf(db: DatabaseExecutor, workspaceId: string) {
  return rows<Record<string, unknown>>(
    db,
    sql`select o.default_plan, o.kind, o.credit_kind, o.status, o.origin,
               v.name_nl, v.name_en, v.price_cents, v.vat_rate_basis_points, v.classes_per_week,
               v.term_months, v.billing_cycle, v.makeups_per_month, v.cutoff_minutes, v.end_of_term,
               v.renewal_window_days, v.covered_class_ids, v.credits, v.validity_amount,
               v.validity_unit, v.minimum_term_months, v.carry_over_limit, v.returns_per_month
        from offers o join offer_versions v on v.id = o.current_version_id
        where o.organization_id = ${workspaceId} order by o.default_plan`,
  );
}

const EXPECTED = [...AC1_DEFAULTS].sort((a, b) => a.default_plan.localeCompare(b.default_plan));

describe('F052 offers', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 6 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  async function asOwner<T>(
    accountId: string,
    workspaceId: string,
    run: (scope: WorkspaceScope) => Promise<T>,
  ): Promise<T> {
    const entry = await createTenantScopes(() => app.db).inWorkspaceScope(
      { accountId, workspaceId, admit: () => 'team' },
      run,
    );
    if (entry.status !== 'entered') throw new Error(`Not entered: ${entry.status}`);
    return entry.value;
  }

  /** The constraint (or error code) that refuses `statement`, in a transaction that is rolled back. */
  async function refusedBy(statement: (db: DatabaseExecutor) => Promise<unknown>) {
    try {
      await admin.db.transaction(async (tx) => {
        await statement(tx);
        throw new Error('rollback');
      });
    } catch (error) {
      const cause = (error as { cause?: { code?: string; constraint?: string; message?: string } })
        .cause;
      if (cause?.code) return cause.constraint ?? cause.message ?? cause.code;
      if ((error as Error).message !== 'rollback') throw error;
    }
    return undefined;
  }

  async function gym() {
    const workspace = await createWorkspace(admin.db);
    const john = await createAccount(admin.db, { label: 'john' });
    await addTeamRole(admin.db, { workspaceId: workspace.id, accountId: john.id, role: 'owner' });
    return {
      workspaceId: workspace.id,
      inScope: <T>(run: (scope: WorkspaceScope) => Promise<T>) =>
        asOwner(john.id, workspace.id, run),
    };
  }

  describe('AC1: the default plans of a new workspace', () => {
    it('AC1: a workspace created through the repository has exactly the three, switched off, without a price or a VAT rate', async () => {
      const account = await createAccount(admin.db, { label: 'sarah' });
      const created = await createTenantScopes(() => app.db).inAccountScope(
        { accountId: account.id, workspaces: 'team' },
        (scope) =>
          createWorkspaceWithOwner(scope, {
            ...DEFAULTS,
            name: "John's Gym",
            slug: 'offers-johns-gym',
            defaultOffers: testDefaultOffers(),
          }),
      );
      if (!created) throw new Error('The workspace was not created.');

      expect(await defaultsOf(admin.db, created.id)).toEqual(EXPECTED);
      expect(
        await admin.db.$count(offers, eq(offers.organizationId, created.id)),
        'exactly three offers',
      ).toBe(3);
      expect(
        await admin.db.$count(offerVersions, eq(offerVersions.organizationId, created.id)),
      ).toBe(3);
    });

    it('AC1: a failure later in the create leaves no offer behind', async () => {
      const before = await admin.db.$count(offers);
      const account = await createAccount(admin.db, { label: 'rollback' });
      await expect(
        createTenantScopes(() => app.db).inAccountScope(
          { accountId: account.id, workspaces: 'team' },
          async (scope) => {
            await createWorkspaceWithOwner(scope, {
              ...DEFAULTS,
              name: 'Rolled back',
              slug: 'offers-rolled-back',
              defaultOffers: testDefaultOffers(),
            });
            throw new Error('the request failed afterwards');
          },
        ),
      ).rejects.toThrow('the request failed afterwards');
      expect(await admin.db.$count(offers)).toBe(before);
    });

    it('AC12: each workspace has its own copy: changing one workspace’s offer, or the plans given to the next workspace, changes no other', async () => {
      const make = async (slug: string, plans: NewOffer[]) => {
        const account = await createAccount(admin.db, { label: slug });
        const created = await createTenantScopes(() => app.db).inAccountScope(
          { accountId: account.id, workspaces: 'team' },
          (scope) =>
            createWorkspaceWithOwner(scope, {
              ...DEFAULTS,
              name: slug,
              slug,
              defaultOffers: plans,
            }),
        );
        if (!created) throw new Error('The workspace was not created.');
        return { id: created.id, accountId: account.id };
      };
      const first = await make('offers-copy-one', testDefaultOffers());
      const changed = testDefaultOffers().map((plan) => ({
        ...plan,
        terms: { ...plan.terms, nameNl: `Nieuw ${plan.terms.nameNl}`, cutoffMinutes: 60 },
      }));
      const second = await make('offers-copy-two', changed);

      expect(await defaultsOf(admin.db, first.id)).toEqual(EXPECTED);
      expect((await defaultsOf(admin.db, second.id)).map((row) => row.name_nl)).toEqual([
        'Nieuw Groepscreditpakket',
        'Nieuw Abonnement',
        'Nieuw Privécreditabonnement',
      ]);

      // The owner of the first renames a default plan: a new version, in that workspace only.
      await asOwner(first.accountId, first.id, async (scope) => {
        const [membership] = (await listOffers(scope)).filter(
          (offer) => offer.defaultPlan === 'membership',
        );
        if (!membership) throw new Error('no membership');
        await addOfferVersion(scope, membership.id, {
          nameNl: 'Mijn abonnement',
          priceCents: 7900,
          vatRateBasisPoints: 2100,
          cutoffMinutes: 720,
        });
      });
      expect((await defaultsOf(admin.db, second.id)).map((row) => row.name_nl)).toEqual([
        'Nieuw Groepscreditpakket',
        'Nieuw Abonnement',
        'Nieuw Privécreditabonnement',
      ]);
    });
  });

  describe('AC1: the backfill of the workspaces that exist', () => {
    it('AC1: gives every existing workspace the three default plans once, and running it twice creates nothing more', async () => {
      const migration = '0034_offers';
      const journal = JSON.parse(
        await readFile(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
      ) as { entries: { tag: string }[] };
      const index = journal.entries.findIndex((entry) => entry.tag === migration);
      expect(index).toBeGreaterThanOrEqual(0);

      const previous = await mkdtemp(join(tmpdir(), 'fivvi-migrations-'));
      const older = await createTestDatabase();
      const client = createDatabase({ url: older.url, maxConnections: 2 });
      try {
        await cp(migrationsFolder, previous, { recursive: true });
        // The journal cut just before the migration: no offers table yet, two workspaces exist.
        await writeFile(
          join(previous, 'meta', '_journal.json'),
          JSON.stringify({ ...journal, entries: journal.entries.slice(0, index) }),
        );
        await migrate(client.db, { migrationsFolder: previous });
        await client.db.execute(
          sql`insert into organizations (name, slug, default_locale, time_zone)
              values ('Older Gym', 'older-gym', 'nl-NL', 'Europe/Amsterdam'),
                     ('Older Studio', 'older-studio', 'en', 'Europe/Amsterdam')`,
        );

        await runMigrations(client.db);
        const workspaces = await rows<{ id: string; slug: string }>(
          client.db,
          sql`select id, slug from organizations order by slug`,
        );
        expect(workspaces).toHaveLength(2);
        for (const workspace of workspaces) {
          expect(await defaultsOf(client.db, workspace.id), workspace.slug).toEqual(EXPECTED);
        }

        // An owner who has switched a default plan on and priced it: the SQL run again leaves it alone.
        await client.db.execute(
          sql`update offers set status = 'on' where default_plan = 'membership'`,
        );
        const statements = (
          await readFile(join(migrationsFolder, `${migration}.sql`), 'utf8')
        ).split('--> statement-breakpoint');
        const backfill = statements.at(-1) ?? '';
        expect(backfill).toContain('INSERT INTO "offers"');
        await client.db.execute(sql.raw(backfill));

        expect(await client.db.$count(offers)).toBe(6);
        expect(await client.db.$count(offerVersions)).toBe(6);
        expect(
          await rows(
            client.db,
            sql`select 1 from offers where default_plan = 'membership' and status <> 'on'`,
          ),
        ).toEqual([]);
      } finally {
        await client.close();
        await older.drop();
        await rm(previous, { recursive: true, force: true });
      }
    });
  });

  describe('versions', () => {
    it('AC5: a change is a new version that becomes the current one; the versions before it stay as they were', async () => {
      const { workspaceId, inScope } = await gym();
      const offerId = await inScope((scope) =>
        createOffer(scope, {
          kind: 'membership',
          creditKind: null,
          defaultPlan: null,
          terms: {
            nameNl: 'Abonnement',
            classesPerWeek: 2,
            termMonths: 6,
            billingCycle: 'month',
            endOfTerm: 'stop',
            makeupsPerMonth: 2,
            cutoffMinutes: 720,
            priceCents: 7900,
            vatRateBasisPoints: 2100,
            renewalWindowDays: 30,
          },
        }),
      );

      const changed = await inScope((scope) =>
        addOfferVersion(scope, offerId, {
          nameNl: 'Abonnement',
          classesPerWeek: 2,
          termMonths: 6,
          billingCycle: 'month',
          endOfTerm: 'stop',
          makeupsPerMonth: 1,
          cutoffMinutes: 720,
          priceCents: 8500,
          vatRateBasisPoints: 2100,
          renewalWindowDays: 30,
        }),
      );
      expect(changed?.version).toMatchObject({ version: 2, priceCents: 8500, makeupsPerMonth: 1 });

      const versions = await inScope((scope) => listOfferVersions(scope, offerId));
      expect(
        versions.map((version) => [version.version, version.priceCents, version.makeupsPerMonth]),
      ).toEqual([
        [1, 7900, 2],
        [2, 8500, 1],
      ]);
      const [current] = await inScope(async (scope) => (await listOffers(scope)).map((o) => o));
      expect(current?.version.id).toBe(versions[1]?.id);
      expect(
        await admin.db.$count(offerVersions, eq(offerVersions.organizationId, workspaceId)),
      ).toBe(2);
    });

    it('AC5: two changes at once get two numbers, one after the other', async () => {
      const { workspaceId, inScope } = await gym();
      const { id } = await addOffer(admin.db, { workspaceId });
      const terms = (priceCents: number) => ({ nameNl: 'Race', priceCents, cutoffMinutes: 720 });
      await Promise.all([
        inScope((scope) => addOfferVersion(scope, id, terms(1000))),
        inScope((scope) => addOfferVersion(scope, id, terms(2000))),
      ]);
      const versions = await inScope((scope) => listOfferVersions(scope, id));
      expect(versions.map((version) => version.version)).toEqual([1, 2, 3]);
    });

    it('AC5: a workspace cannot change another workspace’s offer', async () => {
      const mine = await gym();
      const theirs = await gym();
      const { id } = await addOffer(admin.db, { workspaceId: theirs.workspaceId });
      expect(
        await mine.inScope((scope) =>
          addOfferVersion(scope, id, { nameNl: 'Taken over', cutoffMinutes: 720 }),
        ),
      ).toBeUndefined();
      expect(await admin.db.$count(offerVersions, eq(offerVersions.offerId, id))).toBe(1);
    });

    it('an offer version cannot be updated or deleted, by any role', async () => {
      const { workspaceId, inScope } = await gym();
      const { id, versionId } = await addOffer(admin.db, { workspaceId });

      expect(
        await refusedBy((db) =>
          db.update(offerVersions).set({ priceCents: 1 }).where(eq(offerVersions.id, versionId)),
        ),
      ).toMatch(/immutable/);
      expect(
        await refusedBy((db) => db.delete(offerVersions).where(eq(offerVersions.id, versionId))),
      ).toMatch(/immutable/);
      await expect(
        refusedBy((db) => db.execute(sql`TRUNCATE offer_versions CASCADE`)),
      ).resolves.toMatch(/immutable/);
      // The app role, in its own workspace, with the row in sight: the trigger refuses it too.
      await expect(
        inScope(async (scope) => {
          const db = executorOf(scope);
          await db
            .update(offerVersions)
            .set({ priceCents: 1 })
            .where(eq(offerVersions.id, versionId));
        }),
      ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/immutable/) } });
      await expect(
        inScope(async (scope) => {
          const db = executorOf(scope);
          await db.delete(offerVersions).where(eq(offerVersions.id, versionId));
        }),
      ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/immutable/) } });

      const [stored] = await admin.db
        .select({ priceCents: offerVersions.priceCents })
        .from(offerVersions)
        .where(eq(offerVersions.offerId, id));
      expect(stored?.priceCents).toBe(7900);
    });

    it('an offer always has a current version of its own: neither none nor another offer’s', async () => {
      const { workspaceId } = await gym();
      const other = await addOffer(admin.db, { workspaceId });
      // An offer with no version at all is refused when the transaction commits.
      await expect(
        admin.db.insert(offers).values({
          organizationId: workspaceId,
          kind: 'membership',
          origin: 'owner',
          currentVersionId: '00000000-0000-4000-8000-000000000000',
        }),
      ).rejects.toMatchObject({ cause: { constraint: 'offers_current_version_fk' } });
      // An offer pointing at another offer's version is refused too.
      await expect(
        admin.db.insert(offers).values({
          organizationId: workspaceId,
          kind: 'membership',
          origin: 'owner',
          currentVersionId: other.versionId,
        }),
      ).rejects.toMatchObject({ cause: { constraint: 'offers_current_version_fk' } });
    });
  });

  describe('what the tables refuse', () => {
    const base = (workspaceId: string, kind: 'membership' | 'credit_pack', extra = {}) => ({
      organizationId: workspaceId,
      kind,
      origin: 'owner' as const,
      ...extra,
    });

    function insertWith(
      workspaceId: string,
      offer: Partial<typeof offers.$inferInsert>,
      version: Partial<typeof offerVersions.$inferInsert> = {},
    ) {
      return refusedBy(async (db) => {
        const offerId = crypto.randomUUID();
        const versionId = crypto.randomUUID();
        await db.insert(offers).values({
          ...base(workspaceId, 'membership'),
          ...offer,
          id: offerId,
          currentVersionId: versionId,
        });
        await db.insert(offerVersions).values({
          id: versionId,
          organizationId: workspaceId,
          offerId,
          version: 1,
          nameNl: 'Aanbod',
          cutoffMinutes: 720,
          ...version,
        });
        // The deferred key is checked at commit, so ask for it now.
        await db.execute(sql`set constraints all immediate`);
      });
    }

    it('accepts a valid offer (the control of the refusals below)', async () => {
      const { workspaceId } = await gym();
      expect(
        await insertWith(workspaceId, {}, { priceCents: 7999, vatRateBasisPoints: 2100 }),
      ).toBe(undefined);
    });

    it('a credit offer needs a credit kind, other kinds have none, and the kind is group or private', async () => {
      const { workspaceId } = await gym();
      expect(await insertWith(workspaceId, { kind: 'credit_pack', creditKind: null })).toBe(
        'offers_credit_kind_valid',
      );
      expect(await insertWith(workspaceId, { kind: 'credit_plan', creditKind: null })).toBe(
        'offers_credit_kind_valid',
      );
      expect(await insertWith(workspaceId, { kind: 'membership', creditKind: 'group' })).toBe(
        'offers_credit_kind_valid',
      );
      expect(
        await insertWith(workspaceId, { kind: 'single_class_pass', creditKind: 'private' }),
      ).toBe('offers_credit_kind_valid');
      expect(await insertWith(workspaceId, { kind: 'credit_pack', creditKind: 'group' })).toBe(
        undefined,
      );
      expect(await insertWith(workspaceId, { kind: 'credit_plan', creditKind: 'private' })).toBe(
        undefined,
      );
      // Open Gym credits and a fifth kind do not exist (F034 to F036 add the first).
      await expect(
        admin.db.execute(
          sql`insert into offers (organization_id, kind, credit_kind, origin, current_version_id)
              values (${workspaceId}, 'credit_pack', 'open_gym', 'owner', gen_random_uuid())`,
        ),
      ).rejects.toMatchObject({ cause: { code: '22P02' } });
      await expect(
        admin.db.execute(
          sql`insert into offers (organization_id, kind, origin, current_version_id)
              values (${workspaceId}, 'day_pass', 'owner', gen_random_uuid())`,
        ),
      ).rejects.toMatchObject({ cause: { code: '22P02' } });
    });

    it('AC10: the price is whole euro cents from 1 to 1 000 000 and the VAT rate 2100 or 900 basis points, never 0', async () => {
      const { workspaceId } = await gym();
      for (const priceCents of [0, -1, 1_000_001]) {
        expect(await insertWith(workspaceId, {}, { priceCents })).toBe(
          'offer_versions_price_valid',
        );
      }
      for (const priceCents of [1, 7999, 1_000_000]) {
        expect(await insertWith(workspaceId, {}, { priceCents })).toBe(undefined);
      }
      for (const vatRateBasisPoints of [0, 2000, 21, 1000]) {
        expect(await insertWith(workspaceId, {}, { vatRateBasisPoints })).toBe(
          'offer_versions_vat_rate_valid',
        );
      }
      for (const vatRateBasisPoints of [2100, 900]) {
        expect(await insertWith(workspaceId, {}, { vatRateBasisPoints })).toBe(undefined);
      }
    });

    it('AC10: no floating-point amount is stored: price and VAT rate are integer columns', async () => {
      const columns = await rows<{ column_name: string; data_type: string }>(
        admin.db,
        sql`select column_name, data_type from information_schema.columns
            where table_schema = 'public' and table_name = 'offer_versions'
              and column_name in ('price_cents', 'vat_rate_basis_points')
            order by column_name`,
      );
      expect(columns).toEqual([
        { column_name: 'price_cents', data_type: 'integer' },
        { column_name: 'vat_rate_basis_points', data_type: 'integer' },
      ]);
    });

    it('keeps the cutoff to whole hours, the validity whole, and the covered classes to a real list', async () => {
      const { workspaceId } = await gym();
      expect(await insertWith(workspaceId, {}, { cutoffMinutes: 90 })).toBe(
        'offer_versions_cutoff_valid',
      );
      expect(await insertWith(workspaceId, {}, { cutoffMinutes: 4380 })).toBe(
        'offer_versions_cutoff_valid',
      );
      expect(await insertWith(workspaceId, {}, { validityAmount: 3 })).toBe(
        'offer_versions_validity_valid',
      );
      expect(await insertWith(workspaceId, {}, { coveredClassIds: [] })).toBe(
        'offer_versions_covered_class_ids_valid',
      );
      expect(await insertWith(workspaceId, {}, { nameNl: '  ' })).toBe(
        'offer_versions_name_nl_valid',
      );
    });

    it('a workspace has at most one offer per default plan, and a default plan is named', async () => {
      const { workspaceId } = await gym();
      await addOffer(admin.db, {
        workspaceId,
        offer: { defaultPlan: 'membership' },
      });
      await expect(
        addOffer(admin.db, { workspaceId, offer: { defaultPlan: 'membership' } }),
      ).rejects.toMatchObject({
        cause: { constraint: 'offers_organization_id_default_plan_unique' },
      });
      expect(await insertWith(workspaceId, { origin: 'default', defaultPlan: null })).toBe(
        'offers_default_plan_valid',
      );
      expect(await insertWith(workspaceId, { origin: 'owner', defaultPlan: 'membership' })).toBe(
        'offers_default_plan_valid',
      );
    });

    it('a version points at an offer of its own workspace', async () => {
      const mine = await gym();
      const theirs = await gym();
      const { id } = await addOffer(admin.db, { workspaceId: theirs.workspaceId });
      await expect(
        admin.db.insert(offerVersions).values({
          organizationId: mine.workspaceId,
          offerId: id,
          version: 2,
          nameNl: 'Elders',
          cutoffMinutes: 720,
        }),
      ).rejects.toMatchObject({ cause: { constraint: 'offer_versions_offer_fk' } });
    });
  });
});
