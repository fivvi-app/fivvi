import '@fivvi/ui/globals.css';
import type { ReactNode } from 'react';
import { siteRootMetadata } from '../../../site/metadata';
import { SiteDocument } from '../../../site/site-document';

// The Dutch half of the public website (F064, ADR-030): its own root layout, next to the app's.
// Static: a page here reads no session, cookie or database, so the build fails if one starts to.
export const dynamic = 'error';
export const metadata = siteRootMetadata;

export default function DutchSiteLayout({ children }: { children: ReactNode }) {
  return <SiteDocument locale="nl-NL">{children}</SiteDocument>;
}
