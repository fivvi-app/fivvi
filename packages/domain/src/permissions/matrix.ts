// Module: The permission matrix: which capabilities a team role has in its workspace; routes and clients ask for a capability, never a role name.
// Spec: F004

/**
 * The permission matrix (F004, `PRODUCT.md §9`): which capabilities a team role has in its
 * workspace. Pure data and lookups, no I/O. Routes, the web and the apps ask for a capability and
 * never compare a role name; a later role (Admin, decision 13) is one more entry here.
 */

/** The team roles that exist today (no `admin`: decision 13). */
export const ROLES = ['owner', 'trainer'] as const;
export type Role = (typeof ROLES)[number];

/** What a team member may do in a workspace; code only, never shown to a person. */
export const CAPABILITIES = [
  'workspace.manage',
  'team.view',
  'team.manage',
  'trainers.view',
  'clients.view',
  'clients.manage',
  'location.read',
  'settings.manage',
  'team.invite',
  'session.private.manage.own',
  'session.private.manage.any',
  'session.private.cancel.own',
  'session.private.cancel.any',
  'session.assign',
  'class.manage',
  'class.read',
  'join_link.view',
  'join_link.renew',
  'booking_link.manage',
  'booking_link.copy',
  'access_log.read',
  'client.export',
  'workspace.export',
  'invoices.manage',
  'commerce.offers.manage',
  'calendar.read',
  'calendar.manage',
  'attendance.mark.own',
  'attendance.mark.any',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const MATRIX: Readonly<Record<Role, readonly Capability[]>> = {
  owner: CAPABILITIES,
  trainer: [
    'trainers.view',
    'clients.view',
    'clients.manage',
    'location.read',
    'session.private.manage.own',
    'session.private.cancel.own',
    'class.read',
    'join_link.view',
    'booking_link.copy',
    'calendar.read',
    'attendance.mark.own',
  ],
};

/** The capabilities of a role, in the order of `CAPABILITIES`. */
export function capabilitiesOf(role: Role): Capability[] {
  return [...MATRIX[role]];
}

export function hasCapability(role: Role, capability: Capability): boolean {
  return MATRIX[role].includes(capability);
}

/** The roles that have the capability, in the order of `ROLES`. */
export function rolesWith(capability: Capability): Role[] {
  return ROLES.filter((role) => hasCapability(role, capability));
}
