export {
  type ClientEditDecision,
  type ClientEditFacts,
  decideClientEdit,
} from './clients/edit-client.ts';
export {
  CLIENT_NAME_MAX_LENGTH,
  decideNewClient,
  type NewClientDecision,
  type NewClientFacts,
} from './clients/new-client.ts';
export { maskEmail, normalizeEmail } from './email.ts';
export {
  ADDRESS_ADDITION_MAX_LENGTH,
  ADDRESS_TEXT_MAX_LENGTH,
  type Address,
  type AddressDecision,
  type AddressField,
  type AddressInput,
  type AddressIssue,
  decideAddress,
  normalizePostcode,
} from './locations/address.ts';
export {
  type AddressLookupDecision,
  type AddressLookupInput,
  type AddressLookupQuery,
  decideAddressLookup,
} from './locations/address-lookup.ts';
export {
  defaultLocation,
  LOCATION_NAME_MAX_LENGTH,
  LOCATION_TYPES,
  type LocationType,
} from './locations/default-location.ts';
export {
  CAPABILITIES,
  type Capability,
  capabilitiesOf,
  hasCapability,
  ROLES,
  type Role,
  rolesWith,
} from './permissions/matrix.ts';
export {
  confirmationLanguage,
  type PlanPrivateSessionDecision,
  type PlanPrivateSessionFacts,
  type PlanPrivateSessionRefusal,
  PRIVATE_SESSION_DURATIONS,
  planPrivateSession,
  sendsConfirmation,
} from './scheduling/private-session.ts';
export { type WallClockInstant, wallClockToInstant } from './scheduling/zoned-time.ts';
export {
  canChangeRole,
  canRemoveTeamMember,
  keepsAnOwner,
  type TeamMemberRole,
  type TeamRole,
} from './team/last-owner.ts';
export {
  decideInvitationAnswer,
  decideNewInvitation,
  INVITATION_NAME_MAX_LENGTH,
  INVITATION_VALIDITY_DAYS,
  INVITATIONS_PER_DAY,
  type InvitationAnswerDecision,
  type InvitationAnswerFacts,
  type InvitationFacts,
  type InvitationLanguageSources,
  invitationExpiry,
  invitationLanguage,
  invitationQuotaSince,
  isInvitationOpen,
  type NewInvitationDecision,
  type NewInvitationFacts,
} from './team/trainer-invitation.ts';
export {
  decideTrainerProfileSwitch,
  startsWithTrainerProfile,
  type TrainerProfileSwitchDecision,
} from './team/trainer-profile.ts';
export {
  type CanCreateWorkspaceInput,
  canCreateWorkspace,
  type SignUpAllowlist,
} from './workspaces/can-create.ts';
export { NAME_MAX_LENGTH, WORKSPACE_DEFAULTS } from './workspaces/defaults.ts';
export { RESERVED_SLUGS, slugCandidates, slugFromName } from './workspaces/slug.ts';
