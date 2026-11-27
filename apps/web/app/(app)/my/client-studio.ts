/**
 * The first-party cookie that remembers which of a client's studios *Boeken* shows in this browser
 * (F030): its URL name and nothing else, so no personal data. Per browser, never per account: like
 * the trainer web's `fivvi_last_workspace`, nothing about the current studio is stored on the server.
 */
export const CLIENT_STUDIO_COOKIE = 'fivvi_client_studio';

/** How long the browser keeps it: a year, renewed whenever a studio is chosen. */
export const CLIENT_STUDIO_MAX_AGE = 365 * 24 * 60 * 60;

/** A studio the client belongs to, as the client web shows it: its URL name and its name. */
export interface Studio {
  slug: string;
  name: string;
}

/** The address that makes a studio the current one and opens *Boeken* (`studio/[slug]/route.ts`). */
export function studioPath(slug: string): string {
  return `/my/studio/${encodeURIComponent(slug)}`;
}
