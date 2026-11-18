import '@fivvi/ui/globals.css';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { siteRootMetadata } from '../../../site/metadata';
import { SiteDocument } from '../../../site/site-document';

// The Dutch half of the public website (F064, ADR-030): its own root layout, next to the app's.
// A page here reads no session, cookie or database: it is the same for every visitor. It renders per
// request all the same (`connection()`), because Next.js puts the nonce of the request's
// Content-Security-Policy on its inline scripts while it renders, which a page built in advance
// can't have (E013). The effect is on caching: no build-time HTML for the site.
export const metadata = siteRootMetadata;

export default async function DutchSiteLayout({ children }: { children: ReactNode }) {
  // Waits for the request, so the page renders with its nonce.
  await connection();
  return <SiteDocument locale="nl-NL">{children}</SiteDocument>;
}
