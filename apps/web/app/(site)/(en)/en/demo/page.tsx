import { demoMetadata } from '../../../../../site/demo-metadata';
import { DemoPage } from '../../../../../site/demo-page';
import { JsonLd } from '../../../../../site/json-ld';

export const metadata = demoMetadata('en');

/** The demo page, in English (`/en/demo`). */
export default function EnglishDemoPage() {
  return (
    <>
      <JsonLd page="demo" locale="en" />
      <DemoPage locale="en" />
    </>
  );
}
