import { AudiencePage, audienceMetadata } from '../../../../site/audience/audience-page';
import { JsonLd } from '../../../../site/json-ld';

export const metadata = audienceMetadata('gyms', 'nl-NL');

/** The gyms page, in Dutch (`/sportscholen`). */
export default function DutchGymsPage() {
  return (
    <>
      <JsonLd page="gyms" locale="nl-NL" />
      <AudiencePage page="gyms" locale="nl-NL" />
    </>
  );
}
