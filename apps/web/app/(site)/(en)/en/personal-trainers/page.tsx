import { AudiencePage, audienceMetadata } from '../../../../../site/audience/audience-page';

export const metadata = audienceMetadata('personalTrainers', 'en');

/** The personal trainers page, in English (`/en/personal-trainers`). */
export default function EnglishPersonalTrainersPage() {
  return <AudiencePage page="personalTrainers" locale="en" />;
}
