import { AudiencePage, audienceMetadata } from '../../../../site/audience/audience-page';

export const metadata = audienceMetadata('studios', 'nl-NL');

/** The studios page, in Dutch (`/studios`). */
export default function DutchStudiosPage() {
  return <AudiencePage page="studios" locale="nl-NL" />;
}
