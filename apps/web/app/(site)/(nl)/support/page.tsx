import { SupportPage, supportMetadata } from '../../../../site/info/support-page';
import { JsonLd } from '../../../../site/json-ld';

export const metadata = supportMetadata('nl-NL');

/** The help and contact page, in Dutch (`/support`). */
export default function DutchSupportPage() {
  return (
    <>
      <JsonLd page="support" locale="nl-NL" />
      <SupportPage locale="nl-NL" />
    </>
  );
}
