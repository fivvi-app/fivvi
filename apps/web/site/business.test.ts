import { describe, expect, it } from 'vitest';
import { business, shown } from './business';

describe('F064 AC7 business details', () => {
  it('shows a value only when it is filled in, the trade name included', () => {
    expect(shown(' Trade ')).toBe('Trade');
    for (const missing of [undefined, '', '   ', '{{naam}}', 'K&S {{x}}']) {
      expect(shown(missing)).toBeUndefined();
    }
  });

  it('has only the trade name and the registered name: no KvK, VAT, address or phone number (owner, 11 November 2026, #1344)', () => {
    expect(business).toEqual({ tradeName: 'K&S Apps', legalName: 'K&S Apps' });
  });

  it('has a trade name and no placeholder in any value', () => {
    expect(business.tradeName.trim()).not.toBe('');
    for (const value of Object.values(business)) {
      expect(value ?? '').not.toMatch(/\{\{|\}\}|TODO|XXX|tbd/i);
    }
  });
});
