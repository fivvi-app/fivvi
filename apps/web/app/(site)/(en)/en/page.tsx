import { HomePage } from '../../../../site/home-page';
import { homeMetadata } from '../../../../site/metadata';

export const metadata = homeMetadata('en');

/** The home page, in English (`/en`). */
export default function EnglishHomePage() {
  return <HomePage locale="en" />;
}
