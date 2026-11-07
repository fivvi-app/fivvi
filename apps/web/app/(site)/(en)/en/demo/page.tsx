import { demoMetadata } from '../../../../../site/demo-metadata';
import { DemoPage } from '../../../../../site/demo-page';

export const metadata = demoMetadata('en');

/** The demo page, in English (`/en/demo`). */
export default function EnglishDemoPage() {
  return <DemoPage locale="en" />;
}
