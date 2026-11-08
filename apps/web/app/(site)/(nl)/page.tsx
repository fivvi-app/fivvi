import { HomePage } from '../../../site/home-page';
import { JsonLd } from '../../../site/json-ld';
import { homeMetadata } from '../../../site/metadata';

export const metadata = homeMetadata('nl-NL');

/** The home page, in Dutch (`/`). */
export default function DutchHomePage() {
  return (
    <>
      <JsonLd page="home" locale="nl-NL" />
      <HomePage locale="nl-NL" />
    </>
  );
}
