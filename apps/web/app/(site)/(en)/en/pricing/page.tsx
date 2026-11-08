import { PricingPage, pricingMetadata } from '../../../../../site/info/pricing-page';
import { JsonLd } from '../../../../../site/json-ld';

export const metadata = pricingMetadata('en');

/** The pricing page, in English (`/en/pricing`). */
export default function EnglishPricingPage() {
  return (
    <>
      <JsonLd page="pricing" locale="en" />
      <PricingPage locale="en" />
    </>
  );
}
