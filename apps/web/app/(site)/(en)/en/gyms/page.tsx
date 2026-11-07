import { AudiencePage, audienceMetadata } from '../../../../../site/audience/audience-page';

export const metadata = audienceMetadata('gyms', 'en');

/** The gyms page, in English (`/en/gyms`). */
export default function EnglishGymsPage() {
  return <AudiencePage page="gyms" locale="en" />;
}
