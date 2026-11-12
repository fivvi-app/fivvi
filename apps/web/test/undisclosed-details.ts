/**
 * What the site's pages must not show of the business (owner, 11 November 2026, #1344): a KvK
 * number, a VAT number, a phone number or a postcode. The unit tests and the e2e specs match page
 * text against it.
 */
export const undisclosedDetails = /\b\d{8}\b|\bNL\d{9}B\d{2}\b|\+31|\b\d{4} ?[A-Z]{2}\b/;
