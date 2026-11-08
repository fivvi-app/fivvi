import { demoMetadata } from '../../../../site/demo-metadata';
import { DemoPage } from '../../../../site/demo-page';
import { JsonLd } from '../../../../site/json-ld';

export const metadata = demoMetadata('nl-NL');

/** The demo page, in Dutch (`/demo`). */
export default function DutchDemoPage() {
  return (
    <>
      <JsonLd page="demo" locale="nl-NL" />
      <DemoPage locale="nl-NL" />
    </>
  );
}
