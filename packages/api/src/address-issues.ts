import type { AddressIssue } from '@fivvi/domain';

/**
 * The domain's verdict on an address field as the validation code of the contract: a field that
 * must be filled is `too_small`, a filled postcode or house number in the wrong format
 * `invalid_format`, a text over its limit `too_big` (the codes zod uses for a name, so a client
 * reads them one way). One mapping for the address of a location and the address lookup.
 */
export function addressIssueCode(
  problem: AddressIssue['problem'],
): 'too_small' | 'invalid_format' | 'too_big' {
  if (problem === 'missing') return 'too_small';
  return problem === 'invalid' ? 'invalid_format' : 'too_big';
}
