export {
  createAppDatabaseFromEnv,
  createCronDatabase,
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
export {
  findAccountForInvitation,
  findAccountIdByEmail,
  findPreferredLocaleByEmail,
  nameAccountIfEmpty,
  setAccountName,
  setPreferredLocale,
} from './repositories/accounts.ts';
export {
  type ClientChanges,
  type ClientPage,
  type ClientView,
  createClient,
  findClient,
  findClientByEmail,
  findClientOfAccount,
  listClients,
  type NewClient,
  searchClients,
  updateClient,
} from './repositories/clients.ts';
export {
  type ClassDateChanges,
  type ClassDateUpdate,
  createClassDate,
  createGroupClass,
  findGroupClass,
  type GroupClassChanges,
  type GroupClassView,
  listGroupClasses,
  type NewClassDate,
  type NewGroupClass,
  updateClassDate,
  updateGroupClass,
} from './repositories/group-classes.ts';
export {
  findLocation,
  type LocationAddress,
  type LocationChanges,
  type LocationView,
  listLocations,
  updateLocation,
} from './repositories/locations.ts';
export {
  findMyNextSessionStart,
  hasMySession,
  listMySessions,
  listMyTrainingWorkspaces,
  type PersonalSessionRow,
  type PersonalWorkspace,
} from './repositories/personal-sessions.ts';
export { listMyWorkspaces, type WorkspacePlace } from './repositories/places.ts';
export {
  type AttendanceStatus,
  createPrivateSession,
  findSession,
  listUpcomingSessionsOfClient,
  type NewPrivateSession,
  rescheduleSession,
  type SessionGroupClassView,
  type SessionParticipantView,
  type SessionReschedule,
  type SessionStatus,
  type SessionTrainerView,
  type SessionType,
  type SessionView,
  type UpcomingSessionView,
} from './repositories/sessions.ts';
export {
  addTrainerToTeam,
  changeTeamMemberRole,
  deleteTeamMember,
  findTeamMember,
  findTeamMemberName,
  isOnTeam,
  listTeamMembers,
  lockOwners,
  type TeamMemberRole,
  type TeamMemberView,
} from './repositories/team-members.ts';
export {
  closeInvitation,
  countInvitationsSince,
  createTrainerInvitation,
  findInvitation,
  findPendingInvitation,
  findPendingInvitationByEmail,
  hasPendingInvitation,
  type InvitationRecord,
  listPendingInvitations,
  lockInvitation,
  lockInvitationQuota,
  type NewTrainerInvitation,
  resendInvitation,
  type TrainerInvitationView,
  withdrawInvitation,
} from './repositories/trainer-invitations.ts';
export {
  findOwnTeamMember,
  findTrainer,
  listTrainers,
  type OwnTeamMember,
  setTrainerProfile,
  type TrainerView,
  type TrainerWithProfile,
} from './repositories/trainer-profiles.ts';
export {
  createWorkspaceWithOwner,
  findWorkspace,
  listTeamWorkspaces,
  type NewWorkspace,
  updateWorkspace,
  type WorkspaceSummary,
  type WorkspaceView,
} from './repositories/workspaces.ts';
export * from './schema/index.ts';
export { HELLO_GREETING } from './system-data.ts';
export {
  type AccountScopeInput,
  type ActingAs,
  createTenantScopes,
  type InvitationAdmission,
  type InvitationEntry,
  type InvitationScopeFacts,
  type InvitationScopeInput,
  inEachWorkspace,
  type Place,
  type TeamRole,
  type TenantContext,
  type TenantScope,
  type TenantScopes,
  type WorkspaceEntry,
  type WorkspaceScope,
  type WorkspaceScopeInput,
} from './tenant-scope.ts';
