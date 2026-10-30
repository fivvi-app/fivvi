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
  canRemoveTeamMember,
  keepsAnOwner,
  type TeamMemberRole,
  type TeamRole,
} from './team/last-owner.ts';
export {
  type CanCreateWorkspaceInput,
  canCreateWorkspace,
  type SignUpAllowlist,
} from './workspaces/can-create.ts';
export { NAME_MAX_LENGTH, WORKSPACE_DEFAULTS } from './workspaces/defaults.ts';
export { RESERVED_SLUGS, slugCandidates, slugFromName } from './workspaces/slug.ts';
