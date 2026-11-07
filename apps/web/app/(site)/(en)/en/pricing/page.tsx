import { PricingPage, pricingMetadata } from '../../../../../site/info/pricing-page';

export const metadata = pricingMetadata('en');

/** The pricing page, in English (`/en/pricing`). */
export default function EnglishPricingPage() {
  return <PricingPage locale="en" />;
}
