import { describe, expect, it } from 'vitest';
import { decideStatusChange, PAYMENT_STATUSES, type PaymentStatus } from './status.ts';

describe('decideStatusChange', () => {
  it('AC7: open moves to paid, failed, canceled, expired or pending', () => {
    for (const to of ['paid', 'failed', 'canceled', 'expired', 'pending'] as const) {
      expect(decideStatusChange('open', to)).toEqual({ kind: 'apply', from: 'open', to });
    }
  });

  it('AC7: the same status again changes nothing', () => {
    for (const status of PAYMENT_STATUSES) {
      expect(decideStatusChange(status, status)).toEqual({ kind: 'ignore', reason: 'same' });
    }
  });

  it('AC7: an earlier status arriving late changes nothing', () => {
    expect(decideStatusChange('paid', 'open')).toEqual({ kind: 'ignore', reason: 'stale' });
    expect(decideStatusChange('paid', 'pending')).toEqual({ kind: 'ignore', reason: 'stale' });
    expect(decideStatusChange('pending', 'open')).toEqual({ kind: 'ignore', reason: 'stale' });
    expect(decideStatusChange('charged_back', 'refunded')).toEqual({
      kind: 'ignore',
      reason: 'stale',
    });
  });

  it('AC7: failed, canceled and expired are final', () => {
    const final: PaymentStatus[] = ['failed', 'canceled', 'expired'];
    for (const from of final) {
      for (const to of PAYMENT_STATUSES) {
        if (to === from) continue;
        expect(decideStatusChange(from, to).kind).toBe('ignore');
      }
    }
  });

  it('AC7: a paid payment can later be refunded or charged back', () => {
    expect(decideStatusChange('paid', 'refunded')).toEqual({
      kind: 'apply',
      from: 'paid',
      to: 'refunded',
    });
    expect(decideStatusChange('paid', 'charged_back')).toEqual({
      kind: 'apply',
      from: 'paid',
      to: 'charged_back',
    });
    expect(decideStatusChange('refunded', 'charged_back').kind).toBe('apply');
  });

  it('AC7: a payment that never was paid is not refunded or charged back', () => {
    for (const from of ['open', 'pending', 'failed', 'canceled', 'expired'] as const) {
      expect(decideStatusChange(from, 'refunded').kind).toBe('ignore');
      expect(decideStatusChange(from, 'charged_back').kind).toBe('ignore');
    }
  });

  it('AC7: a paid payment does not turn into failed, canceled or expired', () => {
    for (const to of ['failed', 'canceled', 'expired'] as const) {
      expect(decideStatusChange('paid', to)).toEqual({ kind: 'ignore', reason: 'stale' });
    }
  });
});
