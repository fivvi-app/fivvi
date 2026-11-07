import { AudiencePage, audienceMetadata } from '../../../../site/audience/audience-page';

export const metadata = audienceMetadata('clients', 'nl-NL');

/** The clients page, in Dutch (`/klanten`). */
export default function DutchClientsPage() {
  return <AudiencePage page="clients" locale="nl-NL" />;
}
