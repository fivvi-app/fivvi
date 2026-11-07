import { AudiencePage, audienceMetadata } from '../../../../../site/audience/audience-page';

export const metadata = audienceMetadata('studios', 'en');

/** The studios page, in English (`/en/studios`). */
export default function EnglishStudiosPage() {
  return <AudiencePage page="studios" locale="en" />;
}
