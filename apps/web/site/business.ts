/**
 * The business details the website shows: the one place to fill them in (F064, AC7). The owner
 * gives them before go-live (#648). A detail left out shows nothing on the site, never a
 * placeholder, so the site can be published with only what is known.
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
 * The details of Fivvi's company. Only the trade name is known (`DECISIONS.md` §9, assumption 3,
 * from #151). Add the rest here once the owner gives them.
 */
export const business: BusinessDetails = {
  tradeName: 'K&S Apps',
};

/** The details a footer can list, in order. Each has a label in the catalog (`site.footer.<key>`). */
const LISTED = ['kvk', 'vat', 'address', 'phone'] as const;
export type BusinessDetailKey = (typeof LISTED)[number];

/**
 * The details that are filled in: not missing, not blank, and not an open `{{…}}` value. The
 * footer lists only these.
 */
export function filledDetails(
  details: BusinessDetails,
): { key: BusinessDetailKey; value: string }[] {
  return LISTED.flatMap((key) => {
    const value = details[key]?.trim();
    return value && !value.includes('{{') ? [{ key, value }] : [];
  });
}
