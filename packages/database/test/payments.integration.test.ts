import { PAYMENT_DESCRIPTION_MAX_LENGTH as DOMAIN_DESCRIPTION_MAX_LENGTH } from '@fivvi/domain';
import { ledgerContract } from '@fivvi/domain/testing';
import { cloneTemplateDatabase, type TestDatabase } from '@fivvi/testing/database';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createTenantScopes,
  type DatabaseClient,
  type DatabaseExecutor,
  insertPayment,
  linkProviderCustomer,
  linkProviderPayment,
  type NewPayment,
  type PaymentRecord,
  paymentLedger,
  paymentStatusChanges,
  payments,
  recordStatusChange,
  type WorkspaceScope,
} from '../src/index.ts';
import { PAYMENT_DESCRIPTION_MAX_LENGTH } from '../src/schema/index.ts';
import { executorOf } from '../src/tenant-scope.ts';
import {
  addClient,
  addPayment,
  addTeamRole,
  createAccount,
  createWorkspace,
} from '../src/testing/index.ts';

// The payment ledger tables and their repository (E019, ticket #727): what the database holds the
// line on, and what the repository stores and reads as the app role. Row-level security over all
// three tables is covered by the RLS suite, which has a factory for each (`rls.integration.test.ts`).

const NOW = new Date('2026-11-10T09:00:00Z');

describe('E019 payment ledger', () => {
  let database: TestDatabase;
  let admin: DatabaseClient;
  let app: DatabaseClient;

  beforeAll(async () => {
    database = await cloneTemplateDatabase();
    admin = createDatabase({ url: database.url, maxConnections: 2 });
    app = createDatabase({ url: database.appUrl, maxConnections: 8 });
  });

  afterAll(async () => {
    await app?.close();
    await admin?.close();
    await database?.drop();
  });

  /** A workspace with an Owner, and a way to run in it as that Owner, committing each call. */
  async function gym() {
    const workspace = await createWorkspace(admin.db);
    const owner = await createAccount(admin.db, { label: 'john' });
    await addTeamRole(admin.db, { workspaceId: workspace.id, accountId: owner.id, role: 'owner' });
    const inScope = async <T>(run: (scope: WorkspaceScope) => Promise<T>): Promise<T> => {
      const entry = await createTenantScopes(() => app.db).inWorkspaceScope(
        { accountId: owner.id, workspaceId: workspace.id, admit: () => 'team' },
        run,
      );
      if (entry.status !== 'entered') throw new Error(`Not entered: ${entry.status}`);
      return entry.value;
    };
    return { workspaceId: workspace.id, inScope };
  }

  const newClient = (workspaceId: string) => async () =>
    (await addClient(admin.db, { workspaceId })).id;

  ledgerContract('database ledger', async () => {
    const mine = await gym();
    const theirs = await gym();
    return {
      ledger: paymentLedger(mine.inScope),
      otherLedger: paymentLedger(theirs.inScope),
      newClient: newClient(mine.workspaceId),
      newOtherClient: newClient(theirs.workspaceId),
    };
  });

  function input(clientId: string, overrides: Partial<NewPayment> = {}): NewPayment {
    return {
      clientId,
      kind: 'oneoff',
      purpose: 'open_amount',
      purposeReferenceId: null,
      businessKey: 'open-amount:1',
      amountCents: 4950,
      description: 'Membership October',
      supplied: { nameNl: 'Lidmaatschap', nameEn: 'Membership', period: null, vatRateBp: 2100 },
      testmode: true,
      occurredAt: NOW,
      ...overrides,
    };
  }

  async function violated(statement: (db: DatabaseExecutor) => Promise<unknown>) {
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

  it('AC5: two requests for one business key at once make one payment', async () => {
    const { workspaceId, inScope } = await gym();
    const clientId = await newClient(workspaceId)();
    const results = await Promise.all(
      [1, 2, 3].map(() => inScope((scope) => insertPayment(scope, input(clientId)))),
    );
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.payment.id)).size).toBe(1);
    const rows = await admin.db
      .select()
      .from(payments)
      .where(eq(payments.organizationId, workspaceId));
    expect(rows).toHaveLength(1);
    expect(
      await admin.db
        .select()
        .from(paymentStatusChanges)
        .where(eq(paymentStatusChanges.organizationId, workspaceId)),
    ).toHaveLength(1);
  });

  it('AC7: two status changes at once write one line', async () => {
    const { workspaceId, inScope } = await gym();
    const clientId = await newClient(workspaceId)();
    const { payment } = await inScope((scope) => insertPayment(scope, input(clientId)));
    const change = {
      paymentId: payment.id,
      from: 'open',
      to: 'paid',
      occurredAt: NOW,
      source: 'webhook',
    } as const;
    const results = await Promise.all(
      [1, 2, 3].map(() => inScope((scope) => recordStatusChange(scope, change))),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    const lines = await admin.db
      .select()
      .from(paymentStatusChanges)
      .where(eq(paymentStatusChanges.paymentId, payment.id));
    expect(lines.map((line) => line.toStatus).sort()).toEqual(['open', 'paid']);
  });

  it('AC7: a status line cannot be updated or deleted, by any role', async () => {
    const { workspaceId, inScope } = await gym();
    const { id } = await addPayment(admin.db, { workspaceId });
    const [line] = await admin.db
      .select({ id: paymentStatusChanges.id })
      .from(paymentStatusChanges)
      .where(eq(paymentStatusChanges.paymentId, id));
    if (!line) throw new Error('no status line');

    expect(
      await violated((db) =>
        db
          .update(paymentStatusChanges)
          .set({ toStatus: 'paid' })
          .where(eq(paymentStatusChanges.id, line.id)),
      ),
    ).toMatch(/append-only/);
    expect(
      await violated((db) =>
        db.delete(paymentStatusChanges).where(eq(paymentStatusChanges.id, line.id)),
      ),
    ).toMatch(/append-only/);

    // The app role, in its own workspace, with the row in sight: the trigger refuses it too.
    await expect(
      inScope((scope) =>
        executorOf(scope)
          .update(paymentStatusChanges)
          .set({ toStatus: 'paid' })
          .where(eq(paymentStatusChanges.id, line.id)),
      ),
    ).rejects.toThrow();
  });

  it('AC7: a status line cannot be truncated either, nor by a cascade from the payments', async () => {
    await expect(
      violated((db) => db.execute(sql`TRUNCATE payment_status_changes`)),
    ).resolves.toMatch(/append-only/);
    await expect(violated((db) => db.execute(sql`TRUNCATE payments CASCADE`))).resolves.toMatch(
      /append-only/,
    );
  });

  it('the description limit of the table is the one the domain checks before the provider is called', () => {
    expect(PAYMENT_DESCRIPTION_MAX_LENGTH).toBe(DOMAIN_DESCRIPTION_MAX_LENGTH);
  });

  it('AC7: a payment never has two lines for one status', async () => {
    const { workspaceId } = await gym();
    const { id, clientId } = await addPayment(admin.db, { workspaceId });
    expect(
      await violated((db) =>
        db.insert(paymentStatusChanges).values({
          organizationId: workspaceId,
          paymentId: id,
          clientId,
          fromStatus: 'pending',
          toStatus: 'open',
          occurredAt: NOW,
          source: 'fetch',
        }),
      ),
    ).toBe('payment_status_changes_payment_id_to_status_unique');
  });

  it('holds amounts to whole cents above zero, in euro, with a business key and a description', async () => {
    const { workspaceId } = await gym();
    const client = await addClient(admin.db, { workspaceId });
    const base: typeof payments.$inferInsert = {
      organizationId: workspaceId,
      clientId: client.id,
      kind: 'oneoff',
      purpose: 'open_amount',
      businessKey: 'k',
      amountCents: 100,
      description: 'd',
      supplied: { nameNl: 'a', nameEn: 'b', period: null, vatRateBp: null },
    } as const;
    const insert =
      (values: Partial<typeof base> & { currency?: string }) => (db: DatabaseExecutor) =>
        db.insert(payments).values({ ...base, ...values });
    expect(await violated(insert({ amountCents: 0 }))).toBe('payments_amount_cents_positive');
    expect(await violated(insert({ amountCents: -5 }))).toBe('payments_amount_cents_positive');
    expect(await violated(insert({ currency: 'USD' }))).toBe('payments_currency_eur');
    expect(await violated(insert({ businessKey: ' ' }))).toBe('payments_business_key_valid');
    expect(await violated(insert({ description: ' ' }))).toBe('payments_description_valid');
    expect(await violated(insert({ description: 'x'.repeat(256) }))).toBe(
      'payments_description_valid',
    );
    expect(await violated(insert({}))).toBeUndefined();
  });

  it('keeps a payment inside the workspace of its client', async () => {
    const mine = await gym();
    const theirs = await gym();
    const strangersClient = await addClient(admin.db, { workspaceId: theirs.workspaceId });
    await expect(
      mine.inScope((scope) => insertPayment(scope, input(strangersClient.id))),
    ).rejects.toThrow();
    await expect(
      mine.inScope((scope) => linkProviderCustomer(scope, strangersClient.id, 'cst_x')),
    ).rejects.toThrow();
  });

  it('a provider payment ID belongs to one payment', async () => {
    const { workspaceId, inScope } = await gym();
    const clientId = await newClient(workspaceId)();
    const first = await inScope((scope) => insertPayment(scope, input(clientId)));
    const second = await inScope((scope) =>
      insertPayment(scope, input(clientId, { businessKey: 'open-amount:2' })),
    );
    await inScope((scope) =>
      linkProviderPayment(scope, first.payment.id, {
        providerPaymentId: 'tr_unique_1',
        providerMandateId: null,
      }),
    );
    await expect(
      inScope((scope) =>
        linkProviderPayment(scope, second.payment.id, {
          providerPaymentId: 'tr_unique_1',
          providerMandateId: null,
        }),
      ),
    ).rejects.toThrow();
  });

  it('a client route reads only the client’s own payments and status lines', async () => {
    const { workspaceId } = await gym();
    const annaAccount = await createAccount(admin.db, { label: 'anna' });
    const anna = await addClient(admin.db, { workspaceId, accountId: annaAccount.id });
    const mark = await addClient(admin.db, { workspaceId });
    const annas = await addPayment(admin.db, { workspaceId, clientId: anna.id });
    await addPayment(admin.db, { workspaceId, clientId: mark.id });

    const entry = await createTenantScopes(() => app.db).inWorkspaceScope(
      { accountId: annaAccount.id, workspaceId, admit: () => 'client' },
      async (scope) => {
        const db = executorOf(scope);
        return {
          payments: (await db.select({ id: payments.id }).from(payments)).map((row) => row.id),
          lines: (
            await db.select({ id: paymentStatusChanges.paymentId }).from(paymentStatusChanges)
          ).map((row) => row.id),
        };
      },
    );
    expect(entry).toEqual({
      status: 'entered',
      value: { payments: [annas.id], lines: [annas.id] },
    });
  });

  it('stores the payment as the domain sees it', async () => {
    const { workspaceId, inScope } = await gym();
    const clientId = await newClient(workspaceId)();
    const { payment } = await inScope((scope) =>
      insertPayment(
        scope,
        input(clientId, {
          kind: 'first',
          purpose: 'agreement_first',
          purposeReferenceId: '00000000-0000-4000-8000-000000000001',
          testmode: false,
        }),
      ),
    );
    const expected: PaymentRecord = {
      id: payment.id,
      workspaceId,
      clientId,
      kind: 'first',
      purpose: 'agreement_first',
      purposeReferenceId: '00000000-0000-4000-8000-000000000001',
      businessKey: 'open-amount:1',
      amountCents: 4950,
      currency: 'EUR',
      description: 'Membership October',
      supplied: { nameNl: 'Lidmaatschap', nameEn: 'Membership', period: null, vatRateBp: 2100 },
      providerPaymentId: null,
      providerMandateId: null,
      status: 'open',
      testmode: false,
      createdAt: NOW,
    };
    expect(payment).toEqual(expected);
  });
});
