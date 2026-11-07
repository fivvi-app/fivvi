import {
  SubProcessorsPage,
  subProcessorsMetadata,
} from '../../../../site/info/sub-processors-page';
import { JsonLd } from '../../../../site/json-ld';

export const metadata = subProcessorsMetadata('nl-NL');

/** The sub-processors page, in Dutch (`/subverwerkers`). */
export default function DutchSubProcessorsPage() {
  return (
    <>
      <JsonLd page="subProcessors" locale="nl-NL" />
      <SubProcessorsPage locale="nl-NL" />
    </>
  );
}
