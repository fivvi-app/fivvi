import { and, eq, sql } from 'drizzle-orm';
import { clientBillingDetails, clients } from '../schema/index.ts';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';

// The billing details of a client of a workspace (F059, spec #474, ticket #853), through a
// workspace scope: *Factuur op naam van een bedrijf* with the company name, address and VAT number.
// A scope acting as a client reaches only that client's row (RLS names the client, Q2); a team
// scope reaches the workspace's clients'. One row per client, so a client of two workspaces has two
// sets. The row says who changed it last, the client or the team. A change reaches invoices
// issued afterwards only: an invoice freezes its own copy of the buyer.

export type BillingDetailsChangedBy = 'client' | 'team';

/** The billing details of a client as stored; every field is `null` when the invoice uses the client's name. */
export interface BillingDetailsView {
  /** The client they belong to. */
  readonly clientId: string;
  /** *Factuur op naam van een bedrijf* / *Invoice in a company's name*. */
  readonly asCompany: boolean;
  readonly companyName: string | null;
  readonly street: string | null;
  readonly houseNumber: string | null;
  readonly houseNumberAddition: string | null;
  readonly postcode: string | null;
  readonly city: string | null;
  readonly vatNumber: string | null;
  /** Who changed them last; `null` while nobody has saved any. */
  readonly changedBy: BillingDetailsChangedBy | null;
  /** When they were last saved; `null` while nobody has. */
  readonly changedAt: Date | null;
}

/** What a client has when nobody saved anything: the invoice uses the client's name. */
const none = (clientId: string): BillingDetailsView => ({
  clientId,
  asCompany: false,
  companyName: null,
  street: null,
  houseNumber: null,
  houseNumberAddition: null,
  postcode: null,
  city: null,
  vatNumber: null,
  changedBy: null,
  changedAt: null,
});

/** What `saveBillingDetails` stores for a company invoice: checked and trimmed by the domain. */
export interface BillingDetailsChange {
  readonly companyName: string;
  readonly street: string;
  readonly houseNumber: string;
  readonly houseNumberAddition: string | null;
  readonly postcode: string;
  readonly city: string;
  readonly vatNumber: string | null;
}

const columns = {
  clientId: clientBillingDetails.clientId,
  asCompany: clientBillingDetails.asCompany,
  companyName: clientBillingDetails.companyName,
  street: clientBillingDetails.street,
  houseNumber: clientBillingDetails.houseNumber,
  houseNumberAddition: clientBillingDetails.houseNumberAddition,
  postcode: clientBillingDetails.postcode,
  city: clientBillingDetails.city,
  vatNumber: clientBillingDetails.vatNumber,
  changedBy: clientBillingDetails.changedBy,
  changedAt: clientBillingDetails.updatedAt,
};

/** Whether the scope's workspace has this client, as far as the scope may see (a client scope sees its own only). */
async function clientIsVisible(scope: WorkspaceScope, clientId: string): Promise<boolean> {
  const [row] = await executorOf(scope)
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.organizationId, scope.workspaceId), eq(clients.id, clientId)))
    .limit(1);
  return row !== undefined;
}

/**
 * The billing details of one client of the scope's workspace: what was saved, or the empty ones
 * (company switch off) when nothing was. `undefined` when the workspace has no such client as far
 * as the scope may see: another workspace's client, another client for a client scope.
 */
export async function findBillingDetails(
  scope: WorkspaceScope,
  clientId: string,
): Promise<BillingDetailsView | undefined> {
  if (!(await clientIsVisible(scope, clientId))) return undefined;
  const [row] = await executorOf(scope)
    .select(columns)
    .from(clientBillingDetails)
    .where(
      and(
        eq(clientBillingDetails.organizationId, scope.workspaceId),
        eq(clientBillingDetails.clientId, clientId),
      ),
    )
    .limit(1);
  return row ?? none(clientId);
}

/**
 * Saves the billing details of one client (a PUT: replaces what was saved). `details` is the
 * company's, or `null` for an invoice in the client's own name, which clears the company fields.
 * `changedBy` says who is changing them. `undefined` when the workspace has no such client as far
 * as the scope may see.
 */
export async function saveBillingDetails(
  scope: WorkspaceScope,
  clientId: string,
  details: BillingDetailsChange | null,
  changedBy: BillingDetailsChangedBy,
): Promise<BillingDetailsView | undefined> {
  if (!(await clientIsVisible(scope, clientId))) return undefined;
  const values = {
    asCompany: details !== null,
    companyName: details?.companyName ?? null,
    street: details?.street ?? null,
    houseNumber: details?.houseNumber ?? null,
    houseNumberAddition: details?.houseNumberAddition ?? null,
    postcode: details?.postcode ?? null,
    city: details?.city ?? null,
    vatNumber: details?.vatNumber ?? null,
    changedBy,
  };
  const [row] = await executorOf(scope)
    .insert(clientBillingDetails)
    .values({ organizationId: scope.workspaceId, clientId, ...values })
    .onConflictDoUpdate({
      target: [clientBillingDetails.organizationId, clientBillingDetails.clientId],
      set: { ...values, updatedAt: sql`now()` },
    })
    .returning(columns);
  if (!row) throw new Error('The billing details were not stored.');
  return row;
}
