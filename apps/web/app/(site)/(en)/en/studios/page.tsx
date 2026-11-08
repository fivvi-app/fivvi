import { AudiencePage, audienceMetadata } from '../../../../../site/audience/audience-page';
import { JsonLd } from '../../../../../site/json-ld';

export const metadata = audienceMetadata('studios', 'en');

/** The studios page, in English (`/en/studios`). */
export default function EnglishStudiosPage() {
  return (
    <>
      <JsonLd page="studios" locale="en" />
      <AudiencePage page="studios" locale="en" />
    </>
  );
}
