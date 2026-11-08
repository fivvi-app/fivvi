import '@fivvi/ui/globals.css';
import type { ReactNode } from 'react';
import { siteRootMetadata } from '../../../site/metadata';
import { SiteDocument } from '../../../site/site-document';

// The English half of the public website (F064, ADR-030), under `/en`; see the Dutch layout.
export const dynamic = 'error';
export const metadata = siteRootMetadata;

export default function EnglishSiteLayout({ children }: { children: ReactNode }) {
  return <SiteDocument locale="en">{children}</SiteDocument>;
}
