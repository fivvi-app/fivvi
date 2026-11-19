import { describe, expect, it } from 'vitest';
import { decidePayoutStatusChange, PAYOUT_STATUSES } from './payout-status.ts';

describe('F061 the status of a payout', () => {
  it('knows the four statuses Mollie reports for a settlement', () => {
    expect(PAYOUT_STATUSES).toEqual(['open', 'pending', 'paidout', 'failed']);
  });

  it('AC5: the same status again changes nothing', () => {
    for (const status of PAYOUT_STATUSES) {
      expect(decidePayoutStatusChange(status, status)).toEqual({
        kind: 'ignore',
        reason: 'same',
      });
    }
  });

  it('moves forward: open to pending to paidout or failed, also skipping a step', () => {
    expect(decidePayoutStatusChange('open', 'pending')).toEqual({
      kind: 'apply',
      from: 'open',
      to: 'pending',
    });
    expect(decidePayoutStatusChange('open', 'paidout')).toEqual({
      kind: 'apply',
      from: 'open',
      to: 'paidout',
    });
    expect(decidePayoutStatusChange('pending', 'failed')).toEqual({
      kind: 'apply',
      from: 'pending',
      to: 'failed',
    });
  });

  it('never moves back: an earlier status arriving late is stale', () => {
    expect(decidePayoutStatusChange('paidout', 'open')).toEqual({
      kind: 'ignore',
      reason: 'stale',
    });
    expect(decidePayoutStatusChange('paidout', 'pending')).toEqual({
      kind: 'ignore',
      reason: 'stale',
    });
    expect(decidePayoutStatusChange('pending', 'open')).toEqual({
      kind: 'ignore',
      reason: 'stale',
    });
  });

  it('lets a failed payout be paid out later, as Mollie sends it again', () => {
    expect(decidePayoutStatusChange('failed', 'paidout')).toEqual({
      kind: 'apply',
      from: 'failed',
      to: 'paidout',
    });
    expect(decidePayoutStatusChange('paidout', 'failed')).toEqual({
      kind: 'apply',
      from: 'paidout',
      to: 'failed',
    });
  });
});
