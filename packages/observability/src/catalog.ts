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
});
