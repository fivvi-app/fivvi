import {
  SubProcessorsPage,
  subProcessorsMetadata,
} from '../../../../../site/info/sub-processors-page';
import { JsonLd } from '../../../../../site/json-ld';

export const metadata = subProcessorsMetadata('en');

/** The sub-processors page, in English (`/en/sub-processors`). */
export default function EnglishSubProcessorsPage() {
  return (
    <>
      <JsonLd page="subProcessors" locale="en" />
      <SubProcessorsPage locale="en" />
    </>
  );
}
