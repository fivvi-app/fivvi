import { AudiencePage, audienceMetadata } from '../../../../../site/audience/audience-page';
import { JsonLd } from '../../../../../site/json-ld';

export const metadata = audienceMetadata('personalTrainers', 'en');

/** The personal trainers page, in English (`/en/personal-trainers`). */
export default function EnglishPersonalTrainersPage() {
  return (
    <>
      <JsonLd page="personalTrainers" locale="en" />
      <AudiencePage page="personalTrainers" locale="en" />
    </>
  );
}
