import { JsonLd } from '../../../../site/json-ld';
import { LegalPage, legalMetadata } from '../../../../site/legal/legal-page';

export const metadata = legalMetadata('privacy', 'nl-NL');

/** The privacy policy, in Dutch (`/privacy`). */
export default function DutchPrivacyPage() {
  return (
    <>
      <JsonLd page="privacy" locale="nl-NL" />
      <LegalPage document="privacy" locale="nl-NL" />
    </>
  );
}
