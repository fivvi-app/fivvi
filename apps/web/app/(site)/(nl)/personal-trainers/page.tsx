import { AudiencePage, audienceMetadata } from '../../../../site/audience/audience-page';

export const metadata = audienceMetadata('personalTrainers', 'nl-NL');

/** The personal trainers page, in Dutch (`/personal-trainers`). */
export default function DutchPersonalTrainersPage() {
  return <AudiencePage page="personalTrainers" locale="nl-NL" />;
}
