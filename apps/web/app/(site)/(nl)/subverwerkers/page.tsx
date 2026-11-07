import {
  SubProcessorsPage,
  subProcessorsMetadata,
} from '../../../../site/info/sub-processors-page';

export const metadata = subProcessorsMetadata('nl-NL');

/** The sub-processors page, in Dutch (`/subverwerkers`). */
export default function DutchSubProcessorsPage() {
  return <SubProcessorsPage locale="nl-NL" />;
}
