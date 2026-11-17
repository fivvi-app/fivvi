import type { SentEvent } from '@fivvi/email';
import { anonymousDistinctId, type ProductEvent, type ProductEvents } from '@fivvi/observability';

/**
 * Records the product event `email_sent` for each accepted send (F049 AC11, OBSERVABILITY.md §4.3):
 * the catalog ID and the language, so the operator can count what was sent without personal data.
 * The distinct ID is random for each event, so nothing leads to the recipient's account.
 */
export function recordEmailSent(productEvents: ProductEvents): (sent: SentEvent) => void {
  return ({ emailId, language }) =>
    productEvents.track({
      event: 'email_sent',
      distinctId: anonymousDistinctId(),
      // The IDs of the catalog are the event's enum; the test next to this file keeps them equal.
      properties: { email_id: emailId as EmailId, language },
    });
}

type EmailId = Extract<ProductEvent, { event: 'email_sent' }>['properties']['email_id'];
