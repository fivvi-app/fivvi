import { JsonLd } from '../../../../../site/json-ld';
import { LegalPage, legalMetadata } from '../../../../../site/legal/legal-page';

export const metadata = legalMetadata('terms', 'en');

/** The terms, in English (`/en/terms`). */
export default function EnglishTermsPage() {
  return (
    <>
      <JsonLd page="terms" locale="en" />
      <LegalPage document="terms" locale="en" />
    </>
  );
}
