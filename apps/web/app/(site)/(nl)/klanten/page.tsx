import { AudiencePage, audienceMetadata } from '../../../../site/audience/audience-page';
import { JsonLd } from '../../../../site/json-ld';

export const metadata = audienceMetadata('clients', 'nl-NL');

/** The clients page, in Dutch (`/klanten`). */
export default function DutchClientsPage() {
  return (
    <>
      <JsonLd page="clients" locale="nl-NL" />
      <AudiencePage page="clients" locale="nl-NL" />
    </>
  );
}
