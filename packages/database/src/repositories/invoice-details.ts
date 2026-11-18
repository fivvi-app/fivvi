import { and, asc, eq, sql } from 'drizzle-orm';
import { authUsers, teamMembers, workspaceInvoiceDetails } from '../schema/index.ts';
import { executorOf, type WorkspaceScope } from '../tenant-scope.ts';

// The invoice details of a workspace (F059, spec #474, ticket #852), through a workspace scope:
// the seller's legal name, address, KvK and VAT number, the email for invoice questions and the
// switch *Ik reken geen btw*. One row per workspace, which exists only once complete details were
// saved (the rules that decide what is complete are in `packages/domain`; the caller has checked
// them, and the table's checks hold the same line). A change reaches invoices issued afterwards
// only: an invoice freezes its own copy.

/** What is stored of a workspace's invoice details. */
export interface InvoiceSettingsView {
  readonly legalName: string;
  readonly street: string;
  readonly houseNumber: string;
  readonly houseNumberAddition: string | null;
  readonly postcode: string;
  readonly city: string;
  readonly kvkNumber: string;
  readonly vatNumber: string;
  /** As saved: `null` when the Owner left it empty (the Owner's address is used, `findInvoiceQuestionEmail`). */
  readonly questionEmail: string | null;
  /** *Ik reken geen btw* / *I don't charge VAT*. */
  readonly noVat: boolean;
}

/** What `saveInvoiceSettings` stores: complete, trimmed and checked by the domain. */
export type InvoiceSettingsChange = InvoiceSettingsView;

const columns = {
  legalName: workspaceInvoiceDetails.legalName,
  street: workspaceInvoiceDetails.street,
  houseNumber: workspaceInvoiceDetails.houseNumber,
  houseNumberAddition: workspaceInvoiceDetails.houseNumberAddition,
  postcode: workspaceInvoiceDetails.postcode,
  city: workspaceInvoiceDetails.city,
  kvkNumber: workspaceInvoiceDetails.kvkNumber,
  vatNumber: workspaceInvoiceDetails.vatNumber,
  questionEmail: workspaceInvoiceDetails.questionEmail,
  noVat: workspaceInvoiceDetails.noVat,
};

/** The scope's workspace's invoice details; `undefined` while none were saved (so they are not complete). */
export async function findInvoiceSettings(
  scope: WorkspaceScope,
): Promise<InvoiceSettingsView | undefined> {
  const [row] = await executorOf(scope)
    .select(columns)
    .from(workspaceInvoiceDetails)
    .where(eq(workspaceInvoiceDetails.organizationId, scope.workspaceId))
    .limit(1);
  return row;
}

/**
 * Saves the invoice details of the scope's workspace: the first save creates the row, a later one
 * replaces every field (a PUT). Returns what is stored.
 */
export async function saveInvoiceSettings(
  scope: WorkspaceScope,
  settings: InvoiceSettingsChange,
): Promise<InvoiceSettingsView> {
  const [row] = await executorOf(scope)
    .insert(workspaceInvoiceDetails)
    .values({ organizationId: scope.workspaceId, ...settings })
    .onConflictDoUpdate({
      target: workspaceInvoiceDetails.organizationId,
      set: { ...settings, updatedAt: sql`now()` },
    })
    .returning(columns);
  if (!row) throw new Error('The invoice details were not stored.');
  return row;
}

/**
 * The address invoice questions go to: the one saved on the invoice details (`saved`, what
 * `findInvoiceSettings` returned, so the settings are read once), else the email address of the
 * workspace's first Owner (the one who has been an Owner the longest). `undefined` only for a
 * workspace without an Owner, which does not happen.
 */
export async function findInvoiceQuestionEmail(
  scope: WorkspaceScope,
  saved: Pick<InvoiceSettingsView, 'questionEmail'> | undefined,
): Promise<string | undefined> {
  if (saved?.questionEmail) return saved.questionEmail;
  const [owner] = await executorOf(scope)
    .select({ email: authUsers.email })
    .from(teamMembers)
    .innerJoin(authUsers, eq(authUsers.id, teamMembers.accountId))
    .where(and(eq(teamMembers.organizationId, scope.workspaceId), eq(teamMembers.role, 'owner')))
    .orderBy(asc(teamMembers.createdAt), asc(teamMembers.id))
    .limit(1);
  return owner?.email;
}
