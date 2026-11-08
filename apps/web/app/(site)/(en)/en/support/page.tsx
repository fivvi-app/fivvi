import { SupportPage, supportMetadata } from '../../../../../site/info/support-page';
import { JsonLd } from '../../../../../site/json-ld';

export const metadata = supportMetadata('en');

/** The help and contact page, in English (`/en/support`). */
export default function EnglishSupportPage() {
  return (
    <>
      <JsonLd page="support" locale="en" />
      <SupportPage locale="en" />
    </>
  );
}
