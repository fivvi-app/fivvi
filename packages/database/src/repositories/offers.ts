import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client.ts';
import { type Offer, type OfferVersion, offers, offerVersions } from '../schema/index.ts';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';

// The offers of a workspace and their immutable versions (F052, spec #468, ticket #784). The rules
// (what a valid offer of each kind is, switching on) are in `packages/domain`; these functions
// store what the rules decided. An offer and its first version are written together in one
// transaction (the offer's foreign key to its current version is deferred), and a change is a new
// version that becomes the current one in the same transaction. No version is ever updated.

export type OfferKind = Offer['kind'];
export type OfferCreditKind = NonNullable<Offer['creditKind']>;
export type OfferStatus = Offer['status'];

/**
 * The terms of one version, as the domain's `validateOffer` leaves them: an empty term is `null`
 * or left out. Amounts are integers: `priceCents` including VAT in euro cents, the VAT rate in
 * basis points (2100 or 900).
 */
export interface OfferTerms {
  readonly nameNl: string;
  readonly nameEn?: string | null;
  readonly descriptionNl?: string | null;
  readonly descriptionEn?: string | null;
  readonly priceCents?: number | null;
  readonly vatRateBasisPoints?: number | null;
  readonly billingCycle?: OfferVersion['billingCycle'];
  readonly termMonths?: number | null;
  readonly minimumTermMonths?: number | null;
  readonly endOfTerm?: OfferVersion['endOfTerm'];
  readonly classesPerWeek?: number | null;
  readonly credits?: number | null;
  readonly validity?: { readonly amount: number; readonly unit: 'day' | 'week' | 'month' } | null;
  readonly carryOverLimit?: number | null;
  readonly oncePerClient?: boolean;
  readonly membersOnly?: boolean;
  /** Minutes: a whole number of hours. */
  readonly cutoffMinutes: number;
  readonly makeupsPerMonth?: number | null;
  /** `null`: credits always come back on a timely cancellation. */
  readonly returnsPerMonth?: number | null;
  /** The group classes the offer is limited to; `null` or left out: all group classes. */
  readonly coveredClassIds?: readonly string[] | null;
  readonly renewalWindowDays?: number | null;
}

export interface NewOffer {
  readonly kind: OfferKind;
  /** Exactly for a credit pack and a credit plan. */
  readonly creditKind: OfferCreditKind | null;
  /** Default `off`: nothing is for sale before the owner decides. */
  readonly status?: Exclude<OfferStatus, 'archived'>;
  /** The default plan this is a copy of; `null` for an owner-made offer. */
  readonly defaultPlan: string | null;
  readonly terms: OfferTerms;
}

/** An offer with the version that is its current one. */
export interface OfferView {
  readonly id: string;
  readonly kind: OfferKind;
  readonly creditKind: OfferCreditKind | null;
  readonly status: OfferStatus;
  readonly origin: Offer['origin'];
  readonly defaultPlan: string | null;
  readonly version: OfferVersionView;
}

/** One version as stored; `updated_at` is left out, a version never changes. */
export type OfferVersionView = Omit<OfferVersion, 'organizationId' | 'updatedAt'>;

function versionValues(
  organizationId: string,
  offerId: string,
  versionId: string,
  version: number,
  terms: OfferTerms,
): typeof offerVersions.$inferInsert {
  return {
    id: versionId,
    organizationId,
    offerId,
    version,
    nameNl: terms.nameNl,
    nameEn: terms.nameEn ?? null,
    descriptionNl: terms.descriptionNl ?? null,
    descriptionEn: terms.descriptionEn ?? null,
    priceCents: terms.priceCents ?? null,
    vatRateBasisPoints: terms.vatRateBasisPoints ?? null,
    billingCycle: terms.billingCycle ?? null,
    termMonths: terms.termMonths ?? null,
    minimumTermMonths: terms.minimumTermMonths ?? null,
    endOfTerm: terms.endOfTerm ?? null,
    classesPerWeek: terms.classesPerWeek ?? null,
    credits: terms.credits ?? null,
    validityAmount: terms.validity?.amount ?? null,
    validityUnit: terms.validity?.unit ?? null,
    carryOverLimit: terms.carryOverLimit ?? null,
    oncePerClient: terms.oncePerClient ?? false,
    membersOnly: terms.membersOnly ?? false,
    cutoffMinutes: terms.cutoffMinutes,
    makeupsPerMonth: terms.makeupsPerMonth ?? null,
    returnsPerMonth: terms.returnsPerMonth ?? null,
    coveredClassIds: terms.coveredClassIds ? [...terms.coveredClassIds] : null,
    renewalWindowDays: terms.renewalWindowDays ?? null,
  };
}

/**
 * Writes an offer and its first version (version 1) for a workspace, on an executor that is in a
 * transaction (the scope's, or a test's): the offer and its version point at each other and the
 * key is checked when the transaction commits. The caller has decided the offer is valid. Used by
 * `createOffer`, by creating a workspace (the default plans) and by the seed.
 */
export async function insertOffer(
  db: Pick<DatabaseExecutor, 'insert'>,
  organizationId: string,
  offer: NewOffer,
): Promise<{ id: string; versionId: string }> {
  const id = randomUUID();
  const versionId = randomUUID();
  await db.insert(offers).values({
    id,
    organizationId,
    kind: offer.kind,
    creditKind: offer.creditKind,
    status: offer.status ?? 'off',
    origin: offer.defaultPlan === null ? 'owner' : 'default',
    defaultPlan: offer.defaultPlan,
    currentVersionId: versionId,
  });
  await db
    .insert(offerVersions)
    .values(versionValues(organizationId, id, versionId, 1, offer.terms));
  return { id, versionId };
}

const columns = {
  id: offers.id,
  kind: offers.kind,
  creditKind: offers.creditKind,
  status: offers.status,
  origin: offers.origin,
  defaultPlan: offers.defaultPlan,
  version: offerVersions,
};

function viewOf(row: {
  id: string;
  kind: OfferKind;
  creditKind: OfferCreditKind | null;
  status: OfferStatus;
  origin: Offer['origin'];
  defaultPlan: string | null;
  version: OfferVersion;
}): OfferView {
  const { organizationId: _organizationId, updatedAt: _updatedAt, ...version } = row.version;
  return { ...row, version };
}

/** Creates an owner-made offer or a copy of a default plan in the scope's workspace. */
export async function createOffer(scope: WorkspaceScope, offer: NewOffer): Promise<string> {
  return (await insertOffer(executorOf(scope), scope.workspaceId, offer)).id;
}

async function selectOffers(
  db: Pick<DatabaseExecutor, 'select'>,
  workspaceId: string,
  offerId?: string,
): Promise<OfferView[]> {
  const rows = await db
    .select(columns)
    .from(offers)
    .innerJoin(
      offerVersions,
      and(
        eq(offerVersions.organizationId, offers.organizationId),
        eq(offerVersions.id, offers.currentVersionId),
      ),
    )
    .where(
      and(
        eq(offers.organizationId, workspaceId),
        offerId === undefined ? undefined : eq(offers.id, offerId),
      ),
    )
    .orderBy(asc(offerVersions.nameNl), asc(offers.id));
  return rows.map(viewOf);
}

/** The workspace's offers with their current versions, by name in Dutch. */
export function listOffers(scope: WorkspaceScope): Promise<OfferView[]> {
  return selectOffers(executorOf(scope), scope.workspaceId);
}

/**
 * Writes a new version of an offer, the next number, and makes it the offer's current one; the
 * versions before it stay as they were. The offer row is locked first, so two changes at once get
 * two numbers, one after the other. `false` when the workspace has no such offer. On an executor
 * that is in a transaction when the caller changes more than the version (the key to the current
 * version is deferred). Used by `addOfferVersion` and by the seed.
 */
export async function appendOfferVersion(
  db: DatabaseExecutor,
  organizationId: string,
  offerId: string,
  terms: OfferTerms,
): Promise<boolean> {
  const [locked] = await db
    .select({ id: offers.id })
    .from(offers)
    .where(and(eq(offers.organizationId, organizationId), eq(offers.id, offerId)))
    .for('update');
  if (!locked) return false;
  const [latest] = await db
    .select({ version: sql<number>`coalesce(max(${offerVersions.version}), 0)` })
    .from(offerVersions)
    .where(
      and(eq(offerVersions.organizationId, organizationId), eq(offerVersions.offerId, offerId)),
    );
  const versionId = randomUUID();
  await db
    .insert(offerVersions)
    .values(versionValues(organizationId, offerId, versionId, (latest?.version ?? 0) + 1, terms));
  await db
    .update(offers)
    .set({ currentVersionId: versionId })
    .where(and(eq(offers.organizationId, organizationId), eq(offers.id, offerId)));
  return true;
}

/**
 * Saves a change of an offer as a new version that becomes its current one. The caller has
 * decided the terms are valid. `undefined` when the workspace has no such offer.
 */
export async function addOfferVersion(
  scope: WorkspaceScope,
  offerId: string,
  terms: OfferTerms,
): Promise<OfferView | undefined> {
  const db = executorOf(scope);
  if (!(await appendOfferVersion(db, scope.workspaceId, offerId, terms))) return undefined;
  return (await selectOffers(db, scope.workspaceId, offerId))[0];
}

/** Every version of one offer of the workspace, oldest first: what an agreement may still point at. */
export async function listOfferVersions(
  scope: WorkspaceScope,
  offerId: string,
): Promise<OfferVersionView[]> {
  const rows = await executorOf(scope)
    .select()
    .from(offerVersions)
    .where(
      and(eq(offerVersions.organizationId, scope.workspaceId), eq(offerVersions.offerId, offerId)),
    )
    .orderBy(asc(offerVersions.version));
  return rows.map(
    ({ organizationId: _organizationId, updatedAt: _updatedAt, ...version }) => version,
  );
}
