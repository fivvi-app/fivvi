import { AudiencePage, audienceMetadata } from '../../../../site/audience/audience-page';
import { JsonLd } from '../../../../site/json-ld';

export const metadata = audienceMetadata('personalTrainers', 'nl-NL');

/** The personal trainers page, in Dutch (`/personal-trainers`). */
export default function DutchPersonalTrainersPage() {
  return (
    <>
      <JsonLd page="personalTrainers" locale="nl-NL" />
      <AudiencePage page="personalTrainers" locale="nl-NL" />
    </>
  );
}
