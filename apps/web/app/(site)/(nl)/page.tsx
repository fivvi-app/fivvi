import { HomePage } from '../../../site/home-page';
import { homeMetadata } from '../../../site/metadata';

export const metadata = homeMetadata('nl-NL');

/** The home page, in Dutch (`/`). */
export default function DutchHomePage() {
  return <HomePage locale="nl-NL" />;
}
