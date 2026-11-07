import type { messages } from '@fivvi/i18n';

type Copy = (typeof messages)['en']['site']['subProcessors'];

/**
 * A service that processes data for Fivvi, as the sub-processors page lists it. The name is the
 * company's own, the same in both languages; what it is for and where it stores come from the
 * catalog (`site.subProcessors.purpose.*`, `.region.*`).
 *
 * `docs/legal/sub-processors.md` is the full list with its legal detail. `sub-processors-page.test.tsx`
 * compares this list with that file whenever the web tests run; a change to the legal file alone
 * runs no web test, so it isn't caught until the next run. Add a service there and here in the same
 * change. Mollie is not
 * in this list: it has a separate role (`site.subProcessors.mollie`).
 */
export interface SubProcessor {
  name: string;
  purpose: keyof Copy['purpose'];
  region: keyof Copy['region'];
}

export const subProcessors: readonly SubProcessor[] = [
  { name: 'Railway', purpose: 'railway', region: 'amsterdam' },
  { name: 'Lettermint', purpose: 'lettermint', region: 'eu' },
  { name: 'Sentry', purpose: 'sentry', region: 'eu' },
  { name: 'PostHog', purpose: 'postHog', region: 'eu' },
  { name: 'Cloudflare Turnstile', purpose: 'turnstile', region: 'worldwide' },
];
