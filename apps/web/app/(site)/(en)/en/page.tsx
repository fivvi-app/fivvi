import { HomePage } from '../../../../site/home-page';
import { JsonLd } from '../../../../site/json-ld';
import { homeMetadata } from '../../../../site/metadata';

export const metadata = homeMetadata('en');

/** The home page, in English (`/en`). */
export default function EnglishHomePage() {
  return (
    <>
      <JsonLd page="home" locale="en" />
      <HomePage locale="en" />
    </>
  );
}
