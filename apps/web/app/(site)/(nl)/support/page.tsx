import { SupportPage, supportMetadata } from '../../../../site/info/support-page';

export const metadata = supportMetadata('nl-NL');

/** The help and contact page, in Dutch (`/support`). */
export default function DutchSupportPage() {
  return <SupportPage locale="nl-NL" />;
}
