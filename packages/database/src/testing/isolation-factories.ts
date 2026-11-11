import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client.ts';
import {
  locations,
  organizations,
  paymentStatusChanges,
  payments,
  sessionParticipants,
  trainerProfiles,
} from '../schema/index.ts';
import {
  addClient,
  addGroupClass,
  addPayment,
  addPaymentCustomer,
  addSession,
  addTeamRole,
  addTrainerInvitation,
  addTrainerProfile,
  createAccount,
  uniqueMarker,
} from './factories.ts';

/**
 * Creates a valid row of one table in a given workspace (E011, AC15). The RLS suite runs every
 * check over every registered table, so a table without a factory fails it by name.
 */
export interface IsolationFactory {
  /** The column that holds the workspace: `organization_id`, or `id` for `organizations`. */
  scopeColumn: 'id' | 'organization_id';
  /** Inserts one valid row for `workspaceId` and returns its id. */
  create(db: DatabaseExecutor, workspaceId: string): Promise<{ id: string }>;
}

/**
 * The isolation factories, by table name. **A new business table adds its entry here**; the
 * conventions test in `rls.integration.test.ts` fails, naming the table, until it does. The
 * factory creates whatever the row needs next to it (for example an account), in the same
 * workspace, and nothing in any other.
 */
export const isolationFactories: Readonly<Record<string, IsolationFactory>> = {
  // The workspace row itself: created for the given id, as `createWorkspace()` does for a new one.
  organizations: {
    scopeColumn: 'id',
    create: async (db, workspaceId) => {
      const marker = uniqueMarker('workspace');
      const [row] = await db
        .insert(organizations)
        .values({
          id: workspaceId,
          name: marker,
          slug: marker,
          defaultLocale: 'nl-NL',
          timeZone: 'Europe/Amsterdam',
        })
        .returning({ id: organizations.id });
      if (!row) throw new Error('workspace was not created.');
      return row;
    },
  },
  team_members: {
    scopeColumn: 'organization_id',
    create: async (db, workspaceId) =>
      addTeamRole(db, { workspaceId, accountId: (await createAccount(db, { label: 'team' })).id }),
  },
  clients: {
    scopeColumn: 'organization_id',
    create: async (db, workspaceId) =>
      addClient(db, { workspaceId, accountId: (await createAccount(db, { label: 'client' })).id }),
  },
  // The team member it belongs to is an Owner without a profile, so the profile is the one row.
  trainer_profiles: {
    scopeColumn: 'organization_id',
    create: async (db, workspaceId) => {
      const teamMember = await addTeamRole(db, {
        workspaceId,
        accountId: (await createAccount(db, { label: 'trainer' })).id,
        role: 'owner',
      });
      return addTrainerProfile(db, { workspaceId, teamMemberId: teamMember.id });
    },
  },
  // A second location, not the default (the default is the workspace's own, made with it).
  locations: {
    scopeColumn: 'organization_id',
    create: async (db, workspaceId) => {
      const [row] = await db
        .insert(locations)
        .values({ organizationId: workspaceId, name: uniqueMarker('location'), type: 'other' })
        .returning({ id: locations.id });
      if (!row) throw new Error('location was not created.');
      return row;
    },
  },
  // Sent by an Owner of the same workspace, who is made for it.
  trainer_invitations: {
    scopeColumn: 'organization_id',
    create: async (db, workspaceId) => {
      const inviter = await addTeamRole(db, {
        workspaceId,
        accountId: (await createAccount(db, { label: 'inviter' })).id,
        role: 'owner',
      });
      return addTrainerInvitation(db, { workspaceId, inviterTeamMemberId: inviter.id });
    },
  },
  // A class with no usual trainer (the trainer profile is its own row, covered by `trainer_profiles`).
  group_classes: {
    scopeColumn: 'organization_id',
    create: (db, workspaceId) => addGroupClass(db, { workspaceId }),
  },
  // A private session with a trainer of the workspace, planned by an Owner of it, and its one client.
  sessions: {
    scopeColumn: 'organization_id',
    create: async (db, workspaceId) => {
      const trainer = await addTeamRole(db, {
        workspaceId,
        accountId: (await createAccount(db, { label: 'session-trainer' })).id,
      });
      const [profile] = await db
        .select({ id: trainerProfiles.id })
        .from(trainerProfiles)
        .where(eq(trainerProfiles.teamMemberId, trainer.id));
      return addSession(db, {
        workspaceId,
        trainerProfileId: profile?.id ?? null,
        createdByTeamMemberId: trainer.id,
      });
    },
  },
  // The place of a client in a session, both made for the workspace.
  session_participants: {
    scopeColumn: 'organization_id',
    create: async (db, workspaceId) => {
      // Inserts only, as every factory does: the RLS suite runs them under contexts that see no row,
      // so a lookup of the default location would fail before the policy refuses the insert.
      const [location] = await db
        .insert(locations)
        .values({ organizationId: workspaceId, name: uniqueMarker('location'), type: 'other' })
        .returning({ id: locations.id });
      if (!location) throw new Error('location was not created.');
      const session = await addSession(db, {
        workspaceId,
        locationId: location.id,
        participant: false,
      });
      const client = await addClient(db, { workspaceId });
      const [row] = await db
        .insert(sessionParticipants)
        .values({ organizationId: workspaceId, sessionId: session.id, clientId: client.id })
        .returning({ id: sessionParticipants.id });
      if (!row) throw new Error('session participant was not created.');
      return row;
    },
  },
  // The provider customer of a client made for the workspace.
  payment_customers: {
    scopeColumn: 'organization_id',
    create: (db, workspaceId) => addPaymentCustomer(db, { workspaceId }),
  },
  // An open payment of a client made for the workspace (its first status line is its own row).
  payments: {
    scopeColumn: 'organization_id',
    create: (db, workspaceId) => addPayment(db, { workspaceId }),
  },
  // A status line of a payment made for the workspace: the line of a payment other than the one
  // `addPayment` gave its first line, so each factory call adds exactly one row.
  payment_status_changes: {
    scopeColumn: 'organization_id',
    create: async (db, workspaceId) => {
      const client = await addClient(db, { workspaceId });
      const [payment] = await db
        .insert(payments)
        .values({
          organizationId: workspaceId,
          clientId: client.id,
          kind: 'oneoff',
          purpose: 'open_amount',
          businessKey: uniqueMarker('open-amount'),
          amountCents: 4950,
          description: 'Membership October',
          supplied: { nameNl: 'Lidmaatschap', nameEn: 'Membership', period: null, vatRateBp: null },
        })
        .returning({ id: payments.id });
      if (!payment) throw new Error('payment was not created.');
      const [row] = await db
        .insert(paymentStatusChanges)
        .values({
          organizationId: workspaceId,
          paymentId: payment.id,
          clientId: client.id,
          fromStatus: null,
          toStatus: 'open',
          occurredAt: new Date(),
          source: 'job',
        })
        .returning({ id: paymentStatusChanges.id });
      if (!row) throw new Error('payment status change was not created.');
      return row;
    },
  },
};
