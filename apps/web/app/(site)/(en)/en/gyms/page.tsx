import { AudiencePage, audienceMetadata } from '../../../../../site/audience/audience-page';
import { JsonLd } from '../../../../../site/json-ld';

export const metadata = audienceMetadata('gyms', 'en');

/** The gyms page, in English (`/en/gyms`). */
export default function EnglishGymsPage() {
  return (
    <>
      <JsonLd page="gyms" locale="en" />
      <AudiencePage page="gyms" locale="en" />
    </>
  );
}
