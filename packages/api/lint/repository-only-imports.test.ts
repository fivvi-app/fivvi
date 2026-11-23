import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import * as database from '@fivvi/database';
import { is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// AC17 of spec #145: code in packages/api/src reaches business data through the repositories of
// @fivvi/database, never through a table or a raw database handle. The rule is the Biome plugin
// lint/repository-only-imports.grit, registered for packages/api/src in the root biome.json. This
// runs it on fixtures laid out like the repo, and on the real code.
const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '../..');
const biome = createRequire(import.meta.url).resolve('@biomejs/biome/bin/biome');
const pluginPath = path.join(packageRoot, 'lint/repository-only-imports.grit');

const SPAWN_TIMEOUT_MS = 60_000;

type Diagnostic = {
  category: string;
  severity: string;
  location: { path: string; start: { line: number } };
};

async function runBiome(cwd: string, target: string): Promise<Diagnostic[]> {
  const output = await promisify(execFile)(
    process.execPath,
    [biome, 'lint', '--reporter=json', target],
    { cwd, env: { ...process.env, NO_COLOR: '1' } },
  ).catch((error: { stdout: string }) => error);
  return JSON.parse(output.stdout).diagnostics;
}

const pluginErrors = (diagnostics: Diagnostic[]) =>
  diagnostics.filter((d) => d.category === 'plugin' && d.severity === 'error');

// What the rule must refuse in packages/api/src: one import per line, so the diagnostics name them.
const FORBIDDEN: Record<string, string> = {
  'a business table': "import { clients } from '@fivvi/database';",
  'a team members table': "import { teamMembers } from '@fivvi/database';",
  'the trainer profiles table': "import { trainerProfiles } from '@fivvi/database';",
  'the locations table': "import { locations } from '@fivvi/database';",
  'the trainer invitations table': "import { trainerInvitations } from '@fivvi/database';",
  'the group classes table': "import { groupClasses } from '@fivvi/database';",
  'the class series table': "import { classSeries } from '@fivvi/database';",
  'the sessions table': "import { sessions } from '@fivvi/database';",
  'the session participants table': "import { sessionParticipants } from '@fivvi/database';",
  'the access log table': "import { accessLog } from '@fivvi/database';",
  'the access log action enum': "import { accessLogAction } from '@fivvi/database';",
  'the deletion log table': "import { deletionLog } from '@fivvi/database';",
  'the retention deletes, which run on a raw handle as the cron role (E014)':
    "import { deleteClosedInvitations } from '@fivvi/database';",
  'the deletion log writer for a raw handle':
    "import { appendDeletionLog } from '@fivvi/database';",
  'the payments table': "import { payments } from '@fivvi/database';",
  'the payment customers table': "import { paymentCustomers } from '@fivvi/database';",
  'the payment status changes table': "import { paymentStatusChanges } from '@fivvi/database';",
  'the payment status enum': "import { paymentStatus } from '@fivvi/database';",
  'the payment refunds table': "import { paymentRefunds } from '@fivvi/database';",
  'the payment refund status changes table':
    "import { paymentRefundStatusChanges } from '@fivvi/database';",
  'the payment chargebacks table': "import { paymentChargebacks } from '@fivvi/database';",
  'the payouts table': "import { payouts } from '@fivvi/database';",
  'the payout status changes table': "import { payoutStatusChanges } from '@fivvi/database';",
  'the payout lines table': "import { payoutLines } from '@fivvi/database';",
  'the payout status enum': "import { payoutStatus } from '@fivvi/database';",
  'the payout line type enum': "import { payoutLineType } from '@fivvi/database';",
  'the payout fee kind enum': "import { payoutFeeKind } from '@fivvi/database';",
  'the refund status enum': "import { refundStatus } from '@fivvi/database';",
  'the offers table': "import { offers } from '@fivvi/database';",
  'the offer versions table': "import { offerVersions } from '@fivvi/database';",
  'the offer kind enum': "import { offerKind } from '@fivvi/database';",
  'the offer writer for a raw handle': "import { insertOffer } from '@fivvi/database';",
  'the workspace invoice details table':
    "import { workspaceInvoiceDetails } from '@fivvi/database';",
  'the session type enum': "import { sessionType } from '@fivvi/database';",
  'the session status enum': "import { sessionStatus } from '@fivvi/database';",
  'the attendance status enum': "import { attendanceStatus } from '@fivvi/database';",
  'the cancellation initiator enum': "import { cancellationInitiator } from '@fivvi/database';",
  'the session participant status changes table':
    "import { sessionParticipantStatusChanges } from '@fivvi/database';",
  'the participant status source enum':
    "import { participantStatusSource } from '@fivvi/database';",
  'a table among allowed names': "import { createClient, clients } from '@fivvi/database';",
  'a table renamed': "import { clients as c } from '@fivvi/database';",
  'a table as a type': "import type { clients } from '@fivvi/database';",
  'a table with an inline type keyword': "import { type clients } from '@fivvi/database';",
  'a sign-in table': "import { authSessions } from '@fivvi/database';",
  'the organizations table': "import { organizations } from '@fivvi/database';",
  createDatabase: "import { createDatabase } from '@fivvi/database';",
  createDatabaseFromEnv: "import { createDatabaseFromEnv } from '@fivvi/database';",
  'the Database type': "import type { Database } from '@fivvi/database';",
  'the DatabaseClient type': "import { type DatabaseClient } from '@fivvi/database';",
  'the DatabaseExecutor type': "import type { DatabaseExecutor } from '@fivvi/database';",
  'a table re-exported': "export { clients } from '@fivvi/database';",
  'a handle re-exported as a type': "export type { Database } from '@fivvi/database';",
  'a namespace import': "import * as db from '@fivvi/database';",
  'export *': "export * from '@fivvi/database';",
  'export * as': "export * as db from '@fivvi/database';",
  'a dynamic import': "export const load = () => import('@fivvi/database');",
  'a require': "export const db = require('@fivvi/database');",
  'drizzle-orm': "import { sql } from 'drizzle-orm';",
  'a drizzle-orm subpath': "import { pgTable } from 'drizzle-orm/pg-core';",
  'the node-postgres driver': "import pg from 'pg';",
  'the seed entry': "import { seed } from '@fivvi/database/seed';",
  'the migrate entry': "import { runMigrations } from '@fivvi/database/migrate';",
  'the testing entry': "import { addClient } from '@fivvi/database/testing';",
  // The handles and the privileged connection of #264 in @fivvi/database.
  createAppDatabaseFromEnv: "import { createAppDatabaseFromEnv } from '@fivvi/database';",
  openPrivilegedDatabase: "import { openPrivilegedDatabase } from '@fivvi/database';",
  // The cron's handle of E012: the role of the cron's tasks, which the API must never reach.
  'AC7: the API cannot import the cron database handle':
    "import { createCronDatabase } from '@fivvi/database';",
  'AC7: the cron database handle renamed':
    "import { createCronDatabase as cron } from '@fivvi/database';",
  'AC7: the cron database handle re-exported':
    "export { createCronDatabase } from '@fivvi/database';",
  inspectConnectionRole: "import { inspectConnectionRole } from '@fivvi/database';",
  readDatabaseConfig: "import { readDatabaseConfig } from '@fivvi/database';",
  // A dynamic import or a require gets the same rule as a static import.
  'a dynamic import of pg': "export const load = () => import('pg');",
  'a dynamic import of drizzle-orm': "export const load = () => import('drizzle-orm');",
  'a dynamic import of a drizzle-orm subpath':
    "export const load = () => import('drizzle-orm/node-postgres');",
  'a dynamic import of the seed entry': "export const load = () => import('@fivvi/database/seed');",
  'a dynamic import of the migrate entry':
    "export const load = () => import('@fivvi/database/migrate');",
  'a dynamic import of the testing entry':
    "export const load = () => import('@fivvi/database/testing');",
  'a require of pg': "export const pg = require('pg');",
  'a require of a drizzle-orm subpath': "export const orm = require('drizzle-orm/node-postgres');",
  'a require of the seed entry': "export const seed = require('@fivvi/database/seed');",
  // A path into the source of the database package is the package without its exports.
  'a relative import of a schema file':
    "import { clients } from '../../database/src/schema/tenancy.ts';",
  'a relative import of the index': "import { createClient } from '../../database/src/index.ts';",
  'a relative import of the client':
    "import { createDatabase } from '../../database/src/client.ts';",
  'a relative re-export': "export { clients } from '../../database/src/schema/tenancy.ts';",
  'a relative dynamic import': "export const load = () => import('../../database/src/index.ts');",
  'a relative require': "export const db = require('../../database/src/index.ts');",
  'a package path into the source':
    "import { clients } from '@fivvi/database/src/schema/tenancy.ts';",
  // Test helpers (the database server, factories) are for tests.
  'the testing package': "import { createTemplateDatabase } from '@fivvi/testing/database';",
  'a testing subpath': "import { startDatabaseServer } from '@fivvi/testing/database/server';",
  'a dynamic import of the testing package':
    "export const load = () => import('@fivvi/testing/clock');",
  // The fake provider and ledger of the payment engine are for tests too.
  'the domain testing entry': "import { FakePaymentProvider } from '@fivvi/domain/testing';",
  'a dynamic import of the domain testing entry':
    "export const load = () => import('@fivvi/domain/testing');",
};

// What packages/api/src does today: types and the repository layer by name.
const ALLOWED = [
  "import type { SignedInAccount, TenantScopes } from '@fivvi/database';",
  "import { HELLO_GREETING, listMyWorkspaces, createClient } from '@fivvi/database';",
  // What packages/api/src/startup.ts (#264) imports from the package: a variable name and a type,
  // neither opens a connection.
  "import { APP_DATABASE_URL_VARIABLE, type ConnectionRoleReport } from '@fivvi/database';",
  "import type { SignedInAccount, SystemGreetingView } from '@fivvi/database';",
  "import { HELLO_GREETING } from '@fivvi/database';",
  "import { type ClientView, findClient } from '@fivvi/database';",
  "export { listClients } from '@fivvi/database';",
  "import { clientsOf } from '@fivvi/other';",
  "import { clients } from './clients.ts';",
  "import { pgx } from 'pgx';",
  "import { sibling } from './database-src.ts';",
  "import { rows } from '../database/source.ts';",
  "export const load = () => import('./clients.ts');",
  "import { testing } from '@fivvi/testing-tools';",
  "import { createPayment } from '@fivvi/domain';",
];

let dir: string;
let diagnostics: Diagnostic[];
let allowedDiagnostics: Diagnostic[];
let realCode: Diagnostic[];
const fixtureFiles = Object.keys(FORBIDDEN).map((name, index) => ({
  name,
  file: `packages/api/src/forbidden-${index}.ts`,
}));

beforeAll(async () => {
  const root = JSON.parse(await readFile(path.join(repoRoot, 'biome.json'), 'utf8'));
  // The override of packages/api/src, with the plugin as an absolute path: the fixtures sit in
  // another folder than the repo's biome.json.
  const override = root.overrides.find(
    (o: { includes: string[] }) => o.includes.join() === 'packages/api/src/**',
  );
  expect(override?.plugins).toEqual(['packages/api/lint/repository-only-imports.grit']);
  const config = {
    root: true,
    // The fixtures live in an ignored folder (test-results/), so the repo's own lint skips them.
    vcs: { enabled: false },
    linter: { rules: { preset: 'none' } },
    overrides: [{ includes: override.includes, plugins: [pluginPath] }],
  };
  await mkdir(path.join(packageRoot, 'test-results'), { recursive: true });
  dir = await mkdtemp(path.join(packageRoot, 'test-results', 'repository-imports-'));
  await writeFile(path.join(dir, 'biome.json'), JSON.stringify(config));
  const write = async (file: string, source: string) => {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), `${source}\n`);
  };
  for (const { name, file } of fixtureFiles) await write(file, FORBIDDEN[name] ?? '');
  await write('packages/api/src/allowed.ts', ALLOWED.join('\n'));
  // The same forbidden imports in a test of the package: tests seed and read rows directly.
  await write('packages/api/test/seeds.ts', Object.values(FORBIDDEN).join('\n'));
  diagnostics = await runBiome(dir, '.');
  allowedDiagnostics = diagnostics.filter((d) => d.location.path.endsWith('allowed.ts'));
  // The real code, with the repo's own configuration.
  realCode = await runBiome(packageRoot, 'src');
}, SPAWN_TIMEOUT_MS);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('E011 repository-only imports in packages/api/src', () => {
  it.each(fixtureFiles)('fails lint on $name', ({ file }) => {
    const flagged = pluginErrors(diagnostics).filter((d) => d.location.path === file);
    expect(flagged.length).toBeGreaterThanOrEqual(1);
  });

  it('passes the repositories, types and other packages by name', () => {
    expect(allowedDiagnostics).toEqual([]);
  });

  it('leaves the tests of the package free to use tables and handles', () => {
    expect(
      pluginErrors(diagnostics).filter((d) => d.location.path.startsWith('packages/api/test/')),
    ).toEqual([]);
  });

  it('passes on the current code of packages/api/src', () => {
    expect(pluginErrors(realCode)).toEqual([]);
    // The real code was linted with the repo's own configuration: the rule is registered.
    expect(realCode.filter((d) => d.category === 'internalError/io')).toEqual([]);
  });
});

describe('E011 every export of @fivvi/database is forbidden or allowed', () => {
  // What a route may import from @fivvi/database, each with why it cannot reach a table or open a
  // connection. Everything else the package exports must be named in table_or_handle() of the rule.
  // One entry per name, sorted by name (the test below holds it, E001 #1483), so a new name goes
  // in its place and not at the end. What the entries are, as the list once grouped them: the
  // repositories (every query takes a tenant scope or runs on system data); from the app-role work
  // (#264) `APP_DATABASE_URL_VARIABLE` and `ConnectionRoleReport`, which packages/api/src/startup.ts
  // imports and neither opens a connection (the ALLOWED fixtures above prove the rule lets them
  // through); the tenant scope, the one way to the repositories; constants and types.
  const ALLOWED_EXPORTS: Record<string, string> = {
    APP_DATABASE_URL_VARIABLE:
      'the name of the app connection variable, a string; the startup message names it, no connection',
    AccessLogActionName: 'type of the access-log repository (E014)',
    AccessLogEntryRecord: 'type of the access-log repository (E014)',
    AccessLogItem: 'type of the access-log repository (E014)',
    AccessLogPage: 'type of the access-log repository (E014)',
    AccessLogQuery: 'type of the access-log repository (E014)',
    AccountScopeInput: 'type of the tenant scope',
    ActingAs: 'type of the tenant scope',
    AttendanceParticipantView: 'type of the attendance repository (F025)',
    AttendanceStatus: 'type of the session repository (F020)',
    BillingDetailsChange: 'type of the billing details repository (F059)',
    BillingDetailsChangedBy: 'type of the billing details repository (F059)',
    BillingDetailsView: 'type of the billing details repository (F059)',
    BookingLinkClassView: 'type of the booking-link repository (F037)',
    BookingLinkLanguageName: 'type of the booking-link repository (F037)',
    BookingLinkScopeName: 'type of the booking-link repository (F037)',
    BookingLinkSessionFacts: 'type of the booking-link repository (F037)',
    BookingLinkView: 'type of the booking-link repository (F037)',
    CancellationInitiator: 'type of the session repository (F026)',
    ChargebackRecord: 'type of the refund repository (F060)',
    ClassDateChanges: 'type of the group-class repository (F021)',
    ClassDateUpdate: 'type of the group-class repository (F021)',
    ClassSeriesChanges: 'type of the class-series repository (F022)',
    ClassSeriesView: 'type of the class-series repository (F022)',
    ClientChanges: 'type',
    ClientPage: 'type',
    ClientView: 'type',
    ClientWorkspaceSummary: 'type of the workspace repository (F030)',
    ConnectionRoleReport:
      'type of the report the startup check receives (a role name and sentences); no handle',
    CoveredClass: 'type of the offers repository (F052)',
    DeletionLogEntryRecord: 'type of the deletion-log repository (E014)',
    EXERCISE_KEY_PATTERN: 'the pattern an exercise key matches, a regular expression (F039)',
    EXERCISE_TYPES: 'the four exercise types of the library, a list of names (F039)',
    GroupClassChanges: 'type of the group-class repository (F021)',
    GroupClassView: 'type of the group-class repository (F021)',
    HELLO_GREETING: 'a constant of the system data',
    InPaymentScope: 'type of the payment-ledger repository (E019)',
    InPayoutScope: 'type of the payout repository (F061)',
    InRefundScope: 'type of the refund repository (F060)',
    InsertRefundResult: 'type of the refund repository (F060)',
    InvitationAdmission: 'type of the tenant scope (F011)',
    InvitationEntry: 'type of the tenant scope (F011)',
    InvitationRecord: 'type of the trainer-invitation repository (F011)',
    InvitationScopeFacts: 'type of the tenant scope (F011)',
    InvitationScopeInput: 'type of the tenant scope (F011)',
    InvitationSend: 'type of the trainer-invitation repository (F049)',
    InvoiceSettingsChange: 'type of the invoice details repository (F059)',
    InvoiceSettingsView: 'type of the invoice details repository (F059)',
    JoinLinkView: 'type of the workspace repository (F029)',
    LocationAddress: 'type of the location repository (F015)',
    LocationChanges: 'type of the location repository (F015)',
    LocationView: 'type of the location repository (F015)',
    MUSCLE_GROUPS: 'the fixed muscle groups of the library, a list of names (F039)',
    NewBookingLink: 'type of the booking-link repository (F037)',
    NewChargeback: 'type of the refund repository (F060)',
    NewClassDate: 'type of the group-class repository (F021)',
    NewClassSeries: 'type of the class-series repository (F022)',
    NewClient: 'type',
    NewGroupClass: 'type of the group-class repository (F021)',
    NewOffer: 'type of the offers repository (F052)',
    NewPayment: 'type of the payment-ledger repository (E019)',
    NewPayout: 'type of the payout repository (F061)',
    NewPayoutLine: 'type of the payout repository (F061)',
    NewPayoutStatusChange: 'type of the payout repository (F061)',
    NewPrivateSession: 'type of the session repository (F020)',
    NewRefund: 'type of the refund repository (F060)',
    NewRefundStatusChange: 'type of the refund repository (F060)',
    NewSeriesDate: 'type of the class-series repository (F022)',
    NewStatusChange: 'type of the payment-ledger repository (E019)',
    NewTrainerInvitation: 'type of the trainer-invitation repository (F011)',
    NewWorkspace: 'type of the workspace repository (F002)',
    OfferChange: 'type of the offers repository (F052)',
    OfferChangeResult: 'type of the offers repository (F052)',
    OfferCreditKind: 'type of the offers repository (F052)',
    OfferKind: 'type of the offers repository (F052)',
    OfferStatus: 'type of the offers repository (F052)',
    OfferTerms: 'type of the offers repository (F052)',
    OfferVersionView: 'type of the offers repository (F052)',
    OfferView: 'type of the offers repository (F052)',
    OwnTeamMember: 'type of the trainer-profile repository (F005)',
    ParticipantStatusChange: 'type of the attendance repository (F025)',
    ParticipantStatusChangeView: 'type of the attendance repository (F025)',
    ParticipantStatusInitiator: 'type of the attendance repository (F025)',
    ParticipantStatusSource: 'type of the attendance repository (F025)',
    PaymentKind: 'type of the payment-ledger repository (E019)',
    PaymentPurpose: 'type of the payment-ledger repository (E019)',
    PaymentRecord: 'type of the payment-ledger repository (E019)',
    PaymentStatus: 'type of the payment-ledger repository (E019)',
    PaymentStatusSource: 'type of the payment-ledger repository (E019)',
    PayoutDetails: 'type of the payout repository (F061)',
    PayoutFeeKind: 'type of the payout repository (F061)',
    PayoutLineRecord: 'type of the payout repository (F061)',
    PayoutLineType: 'type of the payout repository (F061)',
    PayoutRecord: 'type of the payout repository (F061)',
    PayoutStatus: 'type of the payout repository (F061)',
    PayoutStatusChangeRecord: 'type of the payout repository (F061)',
    PersonalSessionRow: 'type of the personal-sessions repository (F013)',
    PersonalWorkspace: 'type of the personal-sessions repository (F013)',
    Place: 'type of the tenant scope',
    RateLimitRule: 'type',
    RefundFacts: 'type of the refund repository (F060)',
    RefundRecord: 'type of the refund repository (F060)',
    RefundStatus: 'type of the refund repository (F060)',
    RefundStatusChangeRecord: 'type of the refund repository (F060)',
    SeriesDateRow: 'type of the class-series repository (F022)',
    SeriesDateUpdate: 'type of the class-series repository (F022)',
    SessionCancellation: 'type of the cancellation repository (F026)',
    SessionCancellationView: 'type of the session repository (F026)',
    SessionGroupClassView: 'type of the session repository (F021)',
    SessionParticipantView: 'type of the session repository (F020)',
    SessionReschedule: 'type of the session repository (F020)',
    SessionSeriesView: 'type of the session repository (F022)',
    SessionStatus: 'type of the session repository (F020)',
    SessionTrainerAssignment: 'type of the session repository (F023)',
    SessionTrainerView: 'type of the session repository (F020)',
    SessionType: 'type of the session repository (F020)',
    SessionView: 'type of the session repository (F020)',
    StatusChangeRecord: 'type of the payment-ledger repository (E019)',
    SystemGreetingView: 'type',
    TeamMemberRole: 'type of the team repository (F003)',
    TeamMemberView: 'type of the team repository (F003)',
    TeamRole: 'type of the tenant scope',
    TenantContext: 'type of the tenant scope',
    TenantScope: 'type of the tenant scope',
    TenantScopes: 'type of the tenant scope',
    TrainerInvitationView: 'type of the trainer-invitation repository (F011)',
    TrainerSessionView: 'type of the session repository (F023)',
    TrainerView: 'type of the trainer-profile repository (F005)',
    TrainerWithProfile: 'type of the trainer-profile repository (F020)',
    UpcomingSessionView: 'type of the session repository (F020)',
    WorkspaceCalendarRow: 'type of the workspace calendar repository (F014)',
    WorkspaceEntry: 'type of the tenant scope',
    WorkspacePlace: 'type',
    WorkspaceScope: 'type of the tenant scope',
    WorkspaceScopeInput: 'type of the tenant scope',
    WorkspaceSummary: 'type of the workspace repository (F002)',
    WorkspaceView: 'type of the workspace repository (F002)',
    accessLogStore:
      'the access log over a workspace scope, as the domain’s AccessLogStore port (E014); no connection of its own',
    addOfferVersion: 'repository of offers, takes the workspace scope (F052)',
    addTrainerToTeam: 'repository of the team, takes the workspace scope (F011)',
    appendAccessLog: 'repository of the access log, takes the workspace scope (E014)',
    assignSessionTrainer: 'repository of the sessions, takes the workspace scope (F023)',
    bulkRequestKey: 'the key of one line of a bulk attendance change, a string function (F025)',
    cancelSession: 'repository of the cancellations, takes the workspace scope (F026)',
    changeOffer: 'repository of offers, takes the workspace scope (F052)',
    changeTeamMemberRole: 'repository of the team, takes the workspace scope (F004)',
    closeInvitation: 'repository of the trainer invitations, takes the workspace scope (F011)',
    consumeRateLimit:
      'query of the rate limits, which have no tenant; takes the executor it is given',
    countInvitationsSince:
      'repository of the trainer invitations, takes the workspace scope (F011)',
    createClassDate: 'repository of the group classes, takes the workspace scope (F021)',
    createClassSeries: 'repository of the class series, takes the workspace scope (F022)',
    createClient: 'repository of clients, takes a workspace scope',
    createGroupClass: 'repository of the group classes, takes the workspace scope (F021)',
    createOffer: 'repository of offers, takes the workspace scope (F052)',
    createPrivateSession: 'repository of the sessions, takes the workspace scope (F020)',
    createSeriesDates: 'repository of the class series, takes the workspace scope (F022)',
    createTenantScopes: 'builds the scopes around an executor it is given; opens no connection',
    createTrainerInvitation:
      'repository of the trainer invitations, takes the workspace scope (F011)',
    createWorkspaceWithOwner: 'repository of workspaces, takes the account scope (F002)',
    deactivateBookingLink: 'repository of booking links, takes the workspace scope (F037)',
    deleteExpiredRateLimits: 'query of the rate limits, which have no tenant',
    deleteTeamMember: 'repository of the team, takes the workspace scope (F003)',
    deletionLogStore:
      'the deletion log over a workspace scope, as the domain’s DeletionLogStore port (E014); the database lets the scope insert entries for its own workspace and nothing else',
    ensureStandingBookingLinks: 'repository of booking links, takes the workspace scope (F037)',
    findAccountForInvitation:
      'repository of accounts, takes a scope; reads the address and whether it is verified (F011)',
    findAccountIdByEmail: 'repository of accounts, takes a scope; reads an account ID only (F006)',
    findAttendanceParticipant: 'repository of attendance, takes the workspace scope (F025)',
    findBillingDetails: 'repository of billing details, takes the workspace scope (F059)',
    findBookingEmails: 'repository of accounts, takes the account scope (F050)',
    findBookingLink: 'repository of booking links, takes the workspace scope (F037)',
    findBookingLinkSession: 'repository of booking links, takes the workspace scope (F037)',
    findClassSeries: 'repository of the class series, takes the workspace scope (F022)',
    findClient: 'repository of clients, takes a workspace scope',
    findClientByEmail: 'repository of clients, takes a workspace scope (F006)',
    findClientOfAccount: 'repository of clients, takes a workspace scope (F006)',
    findGroupClass: 'repository of the group classes, takes the workspace scope (F021)',
    findInvitation: 'repository of the trainer invitations, takes the workspace scope (F011)',
    findInvoiceQuestionEmail: 'repository of invoice details, takes the workspace scope (F059)',
    findInvoiceSettings: 'repository of invoice details, takes the workspace scope (F059)',
    findJoinLink: 'repository of workspaces, takes the workspace scope (F029)',
    findLocation: 'repository of the locations, takes the workspace scope (F020)',
    findMyNextSessionStart:
      'repository of the personal sessions, takes the workspace scope; answers a time (F013)',
    findOffer: 'repository of offers, takes the workspace scope (F052)',
    findOwnTeamMember: 'repository of the trainer profiles, takes the workspace scope (F005)',
    findPayment: 'repository of the payment ledger, takes the workspace scope (E019)',
    findPayout: 'repository of the payouts, takes the workspace scope (F061)',
    findPayoutBySettlement: 'repository of the payouts, takes the workspace scope (F061)',
    findPendingInvitationByEmail:
      'repository of the trainer invitations, takes the workspace scope (F011)',
    findPreferredLocaleByEmail:
      'repository of accounts, takes a scope; reads a language only (F011)',
    findProviderCustomerId: 'repository of the payment ledger, takes the workspace scope (E019)',
    findRefund: 'repository of the refunds and reversals, takes the workspace scope (F060)',
    findRefundFacts: 'repository of the refunds and reversals, takes the workspace scope (F060)',
    findSession: 'repository of the sessions, takes the workspace scope (F020)',
    findStatusChangeByRequest: 'repository of attendance, takes the workspace scope (F025)',
    findSystemGreeting: 'query of the system data, which has no tenant',
    findTeamMember: 'repository of the team, takes the workspace scope (F003)',
    findTeamMemberName:
      'repository of the team, takes the workspace scope; reads a name only (F011)',
    findTrainer: 'repository of the trainer profiles, takes the workspace scope (F020)',
    findWorkspace: 'repository of workspaces, takes the workspace scope (F002)',
    getOrCreateBookingLink: 'repository of booking links, takes the workspace scope (F037)',
    hasMySession:
      'repository of the personal sessions, takes the workspace scope; answers yes or no (F013)',
    hasPendingInvitation:
      'query of the sign-in gate for apps/web, takes the executor it is given; answers yes or no (F011)',
    hasWorkspaceSession:
      'repository of the workspace calendar, takes the workspace scope; answers yes or no (F014)',
    inEachWorkspace:
      'takes the account scope and sets the request transaction’s context to one of its workspaces at a time (F013, ADR-006); the workspace must be in the scope and the account a team member there; opens no connection',
    insertPayment: 'repository of the payment ledger, takes the workspace scope (E019)',
    insertPayout: 'repository of the payouts, takes the workspace scope (F061)',
    insertPayoutLines: 'repository of the payouts, takes the workspace scope (F061)',
    insertRefund: 'repository of the refunds and reversals, takes the workspace scope (F060)',
    isOnTeam: 'repository of the team, takes the workspace scope; answers yes or no (F011)',
    linkProviderCustomer: 'repository of the payment ledger, takes the workspace scope (E019)',
    linkProviderPayment: 'repository of the payment ledger, takes the workspace scope (E019)',
    linkProviderRefund: 'repository of the refunds and reversals, takes the workspace scope (F060)',
    listAccessLog: 'repository of the access log, takes the workspace scope (E014)',
    listActiveClassSeries: 'repository of the class series, takes the workspace scope (F022)',
    listAttendanceParticipants: 'repository of attendance, takes the workspace scope (F025)',
    listBookedClients: 'repository of the sessions, takes the workspace scope (F023)',
    listBookingLinks: 'repository of booking links, takes the workspace scope (F037)',
    listChargebacksOfPayment:
      'repository of the refunds and reversals, takes the workspace scope (F060)',
    listClientWorkspaces: 'repository of workspaces, takes the account scope (F030)',
    listClients: 'repository of clients, takes a workspace scope',
    listCoveredClasses: 'repository of offers, takes the workspace scope (F052)',
    listGroupClasses: 'repository of the group classes, takes the workspace scope (F021)',
    listLocations: 'repository of the locations, takes the workspace scope (F015)',
    listMySessions:
      'repository of the personal sessions, takes the workspace scope; the account’s own sessions (F013)',
    listMyTrainingWorkspaces:
      'repository of the personal sessions, takes the account scope; the workspaces the account trains in (F013)',
    listMyWorkspaces: 'repository of places, takes the account scope',
    listOfferVersions: 'repository of offers, takes the workspace scope (F052)',
    listOffers: 'repository of offers, takes the workspace scope (F052)',
    listParticipantStatusChanges: 'repository of attendance, takes the workspace scope (F025)',
    listPayoutLines: 'repository of the payouts, takes the workspace scope (F061)',
    listPayoutStatusChanges: 'repository of the payouts, takes the workspace scope (F061)',
    listPayouts: 'repository of the payouts, takes the workspace scope (F061)',
    listPendingInvitations:
      'repository of the trainer invitations, takes the workspace scope (F011)',
    listRefundStatusChanges:
      'repository of the refunds and reversals, takes the workspace scope (F060)',
    listRefundsOfPayment:
      'repository of the refunds and reversals, takes the workspace scope (F060)',
    listSeriesDates: 'repository of the class series, takes the workspace scope (F022)',
    listStatusChanges: 'repository of the payment ledger, takes the workspace scope (E019)',
    listTeamMembers: 'repository of the team, takes the workspace scope (F003)',
    listTeamWorkspaces: 'repository of workspaces, takes the account scope (F002)',
    listTrainerSessionsBetween: 'repository of the sessions, takes the workspace scope (F023)',
    listTrainers: 'repository of the trainer profiles, takes the workspace scope (F005)',
    listTrainersWithProfiles:
      'repository of the trainer profiles, takes the workspace scope (F023)',
    listUpcomingSessionsOfClient: 'repository of the sessions, takes the workspace scope (F020)',
    listWorkspaceCalendar:
      'repository of the workspace calendar, takes the workspace scope; every session of that workspace (F014)',
    lockInvitation: 'repository of the trainer invitations, takes the workspace scope (F011)',
    lockInvitationQuota: 'repository of the trainer invitations, takes the workspace scope (F011)',
    lockOwners: 'repository of the team, takes the workspace scope (F003)',
    lockPendingInvitationSend:
      'repository of the trainer invitations, takes the workspace scope (F049)',
    moveDatesToSeries: 'repository of the class series, takes the workspace scope (F022)',
    nameAccountIfEmpty: 'repository of accounts, takes a scope (F011)',
    paymentLedger:
      'the payment ledger over a function that opens a workspace scope (E019); every call goes through the scope, no connection of its own',
    payoutLedger:
      'the payout ledger over a function that opens a workspace scope (F061); every call goes through the scope, no connection of its own',
    pingDatabase: 'runs SELECT 1 on the executor it is given; reads no data',
    recordChargeback: 'repository of the refunds and reversals, takes the workspace scope (F060)',
    recordParticipantStatusChange: 'repository of attendance, takes the workspace scope (F025)',
    recordPayoutStatusChange: 'repository of the payouts, takes the workspace scope (F061)',
    recordRefundStatusChange:
      'repository of the refunds and reversals, takes the workspace scope (F060)',
    recordStatusChange: 'repository of the payment ledger, takes the workspace scope (E019)',
    recordWrongSignInCode: 'query of the sign-in verifications, which have no tenant',
    refreshPayout: 'repository of the payouts, takes the workspace scope (F061)',
    refundLedger:
      'the refund ledger over a function that opens a workspace scope (F060); every call goes through the scope, no connection of its own',
    renewJoinLink: 'repository of workspaces, takes the workspace scope (F029)',
    rescheduleSession: 'repository of the sessions, takes the workspace scope (F020)',
    resendInvitation: 'repository of the trainer invitations, takes the workspace scope (F011)',
    runningAgreementCounts: 'repository of offers, takes the workspace scope (F052)',
    saveBillingDetails: 'repository of billing details, takes the workspace scope (F059)',
    saveInvoiceSettings: 'repository of invoice details, takes the workspace scope (F059)',
    searchClients: 'repository of clients, takes a workspace scope (F006)',
    setAccountName: 'repository of accounts, takes the account scope (F005)',
    setBookingEmails: 'repository of accounts, takes the account scope (F050)',
    setPreferredLocale: 'repository of accounts, takes the account scope (F010)',
    setTrainerProfile: 'repository of the trainer profiles, takes the workspace scope (F005)',
    undoInvitation: 'repository of the trainer invitations, takes the workspace scope (F049)',
    undoResend: 'repository of the trainer invitations, takes the workspace scope (F049)',
    updateClassDate: 'repository of the group classes, takes the workspace scope (F021)',
    updateClassSeries: 'repository of the class series, takes the workspace scope (F022)',
    updateClient: 'repository of clients, takes a workspace scope (F006)',
    updateGroupClass: 'repository of the group classes, takes the workspace scope (F021)',
    updateLocation: 'repository of the locations, takes the workspace scope (F015)',
    updateSeriesDates: 'repository of the class series, takes the workspace scope (F022)',
    updateWorkspace: 'repository of workspaces, takes the workspace scope (F002, F010)',
    withdrawInvitation: 'repository of the trainer invitations, takes the workspace scope (F011)',
  };

  let forbidden: string[];
  beforeAll(async () => {
    const grit = await readFile(pluginPath, 'utf8');
    const list = /pattern table_or_handle\(\) \{\s*r"\(\?:([^)]+)\)"/.exec(grit)?.[1];
    expect(list, 'table_or_handle() in repository-only-imports.grit').toBeDefined();
    forbidden = (list ?? '').split('|');
  });

  // The names the package exports: its runtime keys, and the type names its index declares (types
  // have no runtime key, and a type of a handle is as good as the handle).
  async function exportedNames(): Promise<{ runtime: string[]; types: string[] }> {
    const index = await readFile(path.join(repoRoot, 'packages/database/src/index.ts'), 'utf8');
    const inline = [...index.matchAll(/\btype (\w+)/g)].map((m) => m[1] ?? '');
    // `export type { A, B } from …` blocks name their types without a `type` keyword before each.
    const blocks = [...index.matchAll(/\bexport type \{([^}]*)\}/g)].flatMap((m) =>
      (m[1] ?? '')
        .split(',')
        .map((item) => (item.split(/\bas\b/).pop() ?? '').trim())
        .filter(Boolean),
    );
    const types = [...inline, ...blocks];
    return { runtime: Object.keys(database), types };
  }

  it('classifies every runtime export and type of the package', async () => {
    const { runtime, types } = await exportedNames();
    expect(runtime).not.toHaveLength(0);
    const unclassified = [...runtime, ...types].filter(
      (name) => !forbidden.includes(name) && !(name in ALLOWED_EXPORTS),
    );
    // A new export is a new way into the data until someone says which it is: name it in
    // table_or_handle() of the rule (a table, a handle, anything that opens a connection or
    // builds a query) or in ALLOWED_EXPORTS above with the reason a route may use it.
    expect(
      unclassified,
      'exports of @fivvi/database that are neither forbidden nor allowed',
    ).toEqual([]);
  });

  it('forbids every table', () => {
    const tables = Object.entries(database)
      .filter(([, value]) => is(value, PgTable))
      .map(([name]) => name);
    expect(tables).not.toHaveLength(0);
    expect(tables.filter((name) => !forbidden.includes(name))).toEqual([]);
  });

  it('keeps the allowed list free of forbidden names and of names the package no longer exports', async () => {
    const { runtime, types } = await exportedNames();
    const exported = [...runtime, ...types];
    expect(Object.keys(ALLOWED_EXPORTS).filter((name) => forbidden.includes(name))).toEqual([]);
    expect(Object.keys(ALLOWED_EXPORTS).filter((name) => !exported.includes(name))).toEqual([]);
  });

  // E001 #1483, AC7 of spec #1481: the list is one entry per name in a fixed order (by code unit, as
  // `LC_ALL=C sort` has it), so two PRs that add a name edit different lines and don't conflict.
  it('keeps the allowed list sorted by name', () => {
    const names = Object.keys(ALLOWED_EXPORTS);
    const misplaced = names.flatMap((name, i) => {
      const before = names[i - 1];
      return before !== undefined && name < before
        ? [`\`${name}\` must come before \`${before}\``]
        : [];
    });
    expect(
      misplaced,
      'ALLOWED_EXPORTS is out of order: move each entry to its place (every entry keeps its own lines)',
    ).toEqual([]);
  });

  it('still forbids the connection handles, those of the app-role work (#264) and the cron (E012) included', () => {
    for (const name of [
      'createDatabase',
      'createDatabaseFromEnv',
      'createAppDatabaseFromEnv',
      'createCronDatabase',
      'openPrivilegedDatabase',
      'inspectConnectionRole',
      'readDatabaseConfig',
      'Database',
      'DatabaseClient',
      'DatabaseExecutor',
    ]) {
      expect(forbidden, name).toContain(name);
    }
  });
});
