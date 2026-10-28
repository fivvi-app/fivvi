export {
  createAppDatabaseFromEnv,
  createDatabase,
  type Database,
  type DatabaseClient,
  type DatabaseExecutor,
} from './client.ts';
// `readDatabaseConfig` and the name of the privileged variable stay inside the package: exporting
// them would let any code open the privileged connection past the allow-list (E011, AC17).
export { APP_DATABASE_URL_VARIABLE, type DatabaseConfig } from './env.ts';
export {
  openPrivilegedDatabase,
  PRIVILEGED_ALLOW_LIST,
  PRIVILEGED_USES,
  type PrivilegedOptions,
  type PrivilegedReason,
} from './privileged.ts';
export {
  type ConnectionRoleReport,
  inspectConnectionRole,
} from './queries/connection-role.ts';
export { pingDatabase } from './queries/health.ts';
export {
  consumeRateLimit,
  deleteExpiredRateLimits,
  type RateLimitRule,
} from './queries/rate-limits.ts';
export { findSystemGreeting, type SystemGreetingView } from './queries/system-greetings.ts';
export { recordWrongSignInCode } from './queries/verifications.ts';
export { type ClientView, createClient, findClient, listClients } from './repositories/clients.ts';
export { listMyWorkspaces, type WorkspacePlace } from './repositories/places.ts';
export {
  claimWorkspaceCreation,
  createWorkspaceWithOwner,
  type NewWorkspace,
  type WorkspaceCreationClaim,
  type WorkspaceView,
} from './repositories/workspaces.ts';
export * from './schema/index.ts';
export { HELLO_GREETING } from './system-data.ts';
export {
  type AccountScopeInput,
  type ActingAs,
  createTenantScopes,
  type Place,
  type TeamRole,
  type TenantContext,
  type TenantScope,
  type TenantScopes,
  type WorkspaceEntry,
  type WorkspaceScope,
  type WorkspaceScopeInput,
} from './tenant-scope.ts';
