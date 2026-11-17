import { describe, expect, it } from 'vitest';
import {
  decideRefundStatusChange,
  REFUND_STATUSES,
  type RefundStatus,
  refundStatusOfProvider,
} from './refund-status.ts';

describe('refundStatusOfProvider', () => {
  it('maps the provider statuses to ours; processing is pending', () => {
    expect(refundStatusOfProvider('queued')).toBe('queued');
    expect(refundStatusOfProvider('pending')).toBe('pending');
    expect(refundStatusOfProvider('processing')).toBe('pending');
    expect(refundStatusOfProvider('refunded')).toBe('refunded');
    expect(refundStatusOfProvider('failed')).toBe('failed');
    expect(refundStatusOfProvider('canceled')).toBe('canceled');
  });
});

describe('decideRefundStatusChange', () => {
  it('AC13: a refund moves forward from requested to queued, pending and refunded', () => {
    expect(decideRefundStatusChange('requested', 'queued')).toEqual({
      kind: 'apply',
      from: 'requested',
      to: 'queued',
    });
    expect(decideRefundStatusChange('queued', 'pending')).toEqual({
      kind: 'apply',
      from: 'queued',
      to: 'pending',
    });
    expect(decideRefundStatusChange('pending', 'refunded')).toEqual({
      kind: 'apply',
      from: 'pending',
      to: 'refunded',
    });
  });

  it('AC13: a status can skip a step (the provider reported refunded before we saw pending)', () => {
    expect(decideRefundStatusChange('requested', 'refunded')).toEqual({
      kind: 'apply',
      from: 'requested',
      to: 'refunded',
    });
  });

  it('AC13: the same status again changes nothing', () => {
    for (const status of REFUND_STATUSES) {
      expect(decideRefundStatusChange(status, status)).toEqual({
        kind: 'ignore',
        reason: 'same',
      });
    }
  });

  it('AC13: an earlier status arriving late changes nothing', () => {
    expect(decideRefundStatusChange('pending', 'queued')).toEqual({
      kind: 'ignore',
      reason: 'stale',
    });
    expect(decideRefundStatusChange('refunded', 'pending')).toEqual({
      kind: 'ignore',
      reason: 'stale',
    });
    expect(decideRefundStatusChange('queued', 'requested')).toEqual({
      kind: 'ignore',
      reason: 'stale',
    });
  });

  it('AC13: refunded, failed and canceled are ends: nothing follows them', () => {
    const ends: RefundStatus[] = ['refunded', 'failed', 'canceled'];
    for (const end of ends) {
      for (const other of REFUND_STATUSES) {
        if (other === end) continue;
        expect(decideRefundStatusChange(end, other)).toEqual({ kind: 'ignore', reason: 'stale' });
      }
    }
  });

  it('a refund can fail or be canceled from any step before an end', () => {
    for (const from of ['requested', 'queued', 'pending'] as const) {
      expect(decideRefundStatusChange(from, 'failed').kind).toBe('apply');
      expect(decideRefundStatusChange(from, 'canceled').kind).toBe('apply');
    }
  });
});
