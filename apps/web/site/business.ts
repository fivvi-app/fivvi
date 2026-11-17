/**
 * The business details the website shows: the one place to fill them in (F064, AC7). The footer
 * shows only the trade name and the JSON-LD only the registered name (`legalName`; its `name` is
 * Fivvi) (owner, 11 November 2026, #1344). The KvK number, VAT number and address are reachable
 * through the terms and the privacy policy (`docs/legal`), not on the site's pages, and the phone
 * number is not published. A detail left out shows nothing on the site, never a placeholder.
 */
export interface BusinessDetails {
  /** The trade name the footer shows: the company that runs Fivvi. */
  tradeName: string;
  /** The registered name of the company, for the JSON-LD (`legalName`). */
  legalName?: string;
}

/**
 * The details of Fivvi's company, as the owner gave them (Q2): a VOF with the trade name K&S Apps.
 * The owner confirmed on 9 November 2026 that the VOF is registered as exactly "K&S Apps"
 * (`legalName`).
 */
export const business: BusinessDetails = {
  tradeName: 'K&S Apps',
  legalName: 'K&S Apps',
};

/**
 * A detail as the site may show it: trimmed, or `undefined` when it is missing, blank or still an
 * open `{{…}}` value. Every business detail the site shows goes through this, the trade name too.
 */
export function shown(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text && !text.includes('{{') ? text : undefined;
}
