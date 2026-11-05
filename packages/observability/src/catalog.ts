import { defineCatalog, property } from './event-schema.ts';

/**
 * The product event catalog: the only events `track()` accepts (OBSERVABILITY.md §4). Each
 * feature adds its own events here, with the catalog table in OBSERVABILITY.md, e.g.:
 *
 *   booking_confirmed: {
 *     booking_id: property.uuid(),
 *     channel: property.enum(['booking_page', 'trainer']),
 *   },
 *
 * Never rename an event or change what a property means: add an event with a new name.
 */
export const PRODUCT_EVENT_CATALOG = defineCatalog({
  // F001: someone asked for a sign-in email. No properties: whether the address has an account
  // must not show, and the address, IP address and language are not recorded.
  sign_in_requested: {},
  // F001: someone signed in, with the code or with the link.
  signed_in: {
    method: property.enum(['code', 'link']),
    // The first sign-in of an allowed address created its account.
    new_account: property.boolean(),
  },
  // F002: an allowlisted account created its workspace. The workspace ID only (the account's own
  // UUID is the distinct ID): no workspace name, person's name or email address, which are free
  // text and not allowed as properties.
  workspace_created: {
    workspace_id: property.uuid(),
  },
  // F003: an Owner removed a team member from a workspace. The workspace ID only (the Owner's
  // account UUID is the distinct ID): not the removed person, their name or email address.
  team_member_removed: {
    workspace_id: property.uuid(),
  },
  // F005: an Owner switched their own training on or off. The workspace ID and on/off only (the
  // Owner's account UUID is the distinct ID): not the name or email address of anyone.
  trainer_profile_changed: {
    workspace_id: property.uuid(),
    trains_here: property.boolean(),
  },
  // F015: an Owner changed their workspace's location. The workspace ID only (the Owner's account
  // UUID is the distinct ID): not the location's name or its address, which are free text.
  location_updated: {
    workspace_id: property.uuid(),
  },
  // F011: an Owner invited a trainer. The workspace ID only (the Owner's account UUID is the
  // distinct ID): not the invitation's ID, the person's name, email address or language, and never
  // the token.
  trainer_invited: {
    workspace_id: property.uuid(),
  },
  // F020: a team member planned a private session. The workspace ID and the surface only (the team
  // member's account UUID is the distinct ID): no session or client ID, name, email address, trainer,
  // date or time.
  private_session_created: {
    workspace_id: property.uuid(),
    surface: property.enum(['web', 'ios', 'android']),
  },
  // F011: the invited person accepted, or declined, the invitation. The workspace ID only (the
  // account's UUID is the distinct ID): not the invitation's ID, the person's name or email
  // address, the Owner who invited, and never the token.
  trainer_invitation_accepted: {
    workspace_id: property.uuid(),
  },
  trainer_invitation_declined: {
    workspace_id: property.uuid(),
  },
  // F006: a team member added a client. The workspace ID and the surface only (the team member's
  // account UUID is the distinct ID): no client ID, name, email address or language.
  client_added: {
    workspace_id: property.uuid(),
    surface: property.enum(['web', 'ios', 'android']),
  },
  // F012: a team member switched to another workspace. The workspace ID and the surface only (the
  // team member's account UUID is the distinct ID): no name, role, slug or email address. Nothing
  // about the current workspace is stored; the event only counts switches.
  workspace_switched: {
    workspace_id: property.uuid(),
    surface: property.enum(['web', 'ios', 'android']),
  },
  // F013: a trainer opened their day (*Vandaag* / *Mijn dag*) or their calendar (*Agenda* /
  // *Mijn agenda*). The surface and how many workspaces the view spans only (the trainer's account
  // UUID is the distinct ID): no client name, class name, workspace, time or session.
  my_day_viewed: {
    surface: property.enum(['web', 'ios', 'android']),
    workspace_count: property.number(),
  },
  my_calendar_viewed: {
    surface: property.enum(['web', 'ios', 'android']),
    workspace_count: property.number(),
  },
  // F010: someone chose their interface language. The language and the surface only: the distinct
  // ID is random for each event (`anonymousDistinctId()`), so nothing leads to the account, and no
  // name or email address is recorded.
  language_changed: {
    locale: property.enum(['nl-NL', 'en']),
    surface: property.enum(['web', 'ios', 'android']),
  },
});
