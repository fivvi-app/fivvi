import { demoMetadata } from '../../../../site/demo-metadata';
import { DemoPage } from '../../../../site/demo-page';

export const metadata = demoMetadata('nl-NL');

/** The demo page, in Dutch (`/demo`). */
export default function DutchDemoPage() {
  return <DemoPage locale="nl-NL" />;
}
