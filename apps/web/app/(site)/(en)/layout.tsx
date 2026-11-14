import '@fivvi/ui/globals.css';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { siteRootMetadata } from '../../../site/metadata';
import { SiteDocument } from '../../../site/site-document';

// The English half of the public website (F064, ADR-030), under `/en`; see the Dutch layout,
// which says why it renders per request.
export const metadata = siteRootMetadata;

export default async function EnglishSiteLayout({ children }: { children: ReactNode }) {
  await connection();
  return <SiteDocument locale="en">{children}</SiteDocument>;
}
