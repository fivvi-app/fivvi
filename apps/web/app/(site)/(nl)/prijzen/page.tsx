import { PricingPage, pricingMetadata } from '../../../../site/info/pricing-page';
import { JsonLd } from '../../../../site/json-ld';

export const metadata = pricingMetadata('nl-NL');

/** The pricing page, in Dutch (`/prijzen`). */
export default function DutchPricingPage() {
  return (
    <>
      <JsonLd page="pricing" locale="nl-NL" />
      <PricingPage locale="nl-NL" />
    </>
  );
}
