import { PricingPage, pricingMetadata } from '../../../../site/info/pricing-page';

export const metadata = pricingMetadata('nl-NL');

/** The pricing page, in Dutch (`/prijzen`). */
export default function DutchPricingPage() {
  return <PricingPage locale="nl-NL" />;
}
