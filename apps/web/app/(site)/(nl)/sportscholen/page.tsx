import { AudiencePage, audienceMetadata } from '../../../../site/audience/audience-page';

export const metadata = audienceMetadata('gyms', 'nl-NL');

/** The gyms page, in Dutch (`/sportscholen`). */
export default function DutchGymsPage() {
  return <AudiencePage page="gyms" locale="nl-NL" />;
}
