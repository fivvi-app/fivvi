import { JsonLd } from '../../../../site/json-ld';
import { LegalPage, legalMetadata } from '../../../../site/legal/legal-page';

export const metadata = legalMetadata('terms', 'nl-NL');

/** The terms, in Dutch (`/voorwaarden`). */
export default function DutchTermsPage() {
  return (
    <>
      <JsonLd page="terms" locale="nl-NL" />
      <LegalPage document="terms" locale="nl-NL" />
    </>
  );
}
