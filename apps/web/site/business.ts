/**
 * The business details the website shows: the one place to fill them in (F064, AC7). The owner
 * gave them on 8 November 2026 (`docs/legal/open-questions.md` Q2, #612, #648). A detail left out
 * shows nothing on the site, never a placeholder, so the site can be published with only what is
 * known.
 */
export interface BusinessDetails {
  /** The trade name the footer shows: the company that runs Fivvi. */
  tradeName: string;
  /** Chamber of Commerce (KvK) number. */
  kvk?: string;
  /** VAT (btw) number. */
  vat?: string;
  /** Postal address, on one line. */
  address?: string;
  /** Phone or WhatsApp number. */
  phone?: string;
}

/**
 * The details of Fivvi's company, as the owner gave them (Q2): a VOF with the trade name K&S Apps.
 * The owner chose knowingly to publish the address and the phone number. The registered name is not
 * confirmed apart from the trade name, so there is no `legalName` here and none in the JSON-LD.
 */
export const business: BusinessDetails = {
  tradeName: 'K&S Apps',
  kvk: '92372996',
  vat: 'NL866022788B01',
  address: 'Haringbuisdijk 43, 1086 VA Amsterdam',
  phone: '+31 6 85145755',
};

/**
 * A detail as the site may show it: trimmed, or `undefined` when it is missing, blank or still an
 * open `{{…}}` value. Every business detail the site shows goes through this, the trade name too.
 */
export function shown(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text && !text.includes('{{') ? text : undefined;
}

/** The details a footer can list, in order. Each has a label in the catalog (`site.footer.<key>`). */
const LISTED = ['kvk', 'vat', 'address', 'phone'] as const;
export type BusinessDetailKey = (typeof LISTED)[number];

/**
 * The details that are filled in (`shown`). The footer lists only these.
 */
export function filledDetails(
  details: BusinessDetails,
): { key: BusinessDetailKey; value: string }[] {
  return LISTED.flatMap((key) => {
    const value = shown(details[key]);
    return value ? [{ key, value }] : [];
  });
}
