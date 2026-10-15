import { defineCatalog } from './event-schema.ts';

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
export const PRODUCT_EVENT_CATALOG = defineCatalog({});
