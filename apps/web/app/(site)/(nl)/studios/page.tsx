import { AudiencePage, audienceMetadata } from '../../../../site/audience/audience-page';
import { JsonLd } from '../../../../site/json-ld';

export const metadata = audienceMetadata('studios', 'nl-NL');

/** The studios page, in Dutch (`/studios`). */
export default function DutchStudiosPage() {
  return (
    <>
      <JsonLd page="studios" locale="nl-NL" />
      <AudiencePage page="studios" locale="nl-NL" />
    </>
  );
}
