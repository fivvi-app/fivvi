import { JsonLd } from '../../../../../site/json-ld';
import { LegalPage, legalMetadata } from '../../../../../site/legal/legal-page';

export const metadata = legalMetadata('privacy', 'en');

/** The privacy policy, in English (`/en/privacy`). */
export default function EnglishPrivacyPage() {
  return (
    <>
      <JsonLd page="privacy" locale="en" />
      <LegalPage document="privacy" locale="en" />
    </>
  );
}
