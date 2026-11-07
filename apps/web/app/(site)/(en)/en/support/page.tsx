import { SupportPage, supportMetadata } from '../../../../../site/info/support-page';

export const metadata = supportMetadata('en');

/** The help and contact page, in English (`/en/support`). */
export default function EnglishSupportPage() {
  return <SupportPage locale="en" />;
}
