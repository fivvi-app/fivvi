import { AudiencePage, audienceMetadata } from '../../../../../site/audience/audience-page';

export const metadata = audienceMetadata('clients', 'en');

/** The clients page, in English (`/en/clients`). */
export default function EnglishClientsPage() {
  return <AudiencePage page="clients" locale="en" />;
}
