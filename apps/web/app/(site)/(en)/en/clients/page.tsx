import { AudiencePage, audienceMetadata } from '../../../../../site/audience/audience-page';
import { JsonLd } from '../../../../../site/json-ld';

export const metadata = audienceMetadata('clients', 'en');

/** The clients page, in English (`/en/clients`). */
export default function EnglishClientsPage() {
  return (
    <>
      <JsonLd page="clients" locale="en" />
      <AudiencePage page="clients" locale="en" />
    </>
  );
}
