import {
  SubProcessorsPage,
  subProcessorsMetadata,
} from '../../../../../site/info/sub-processors-page';

export const metadata = subProcessorsMetadata('en');

/** The sub-processors page, in English (`/en/sub-processors`). */
export default function EnglishSubProcessorsPage() {
  return <SubProcessorsPage locale="en" />;
}
