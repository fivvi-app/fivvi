import { describe, expect, it } from 'vitest';
import { business, filledDetails } from './business';

describe('F064 AC7 business details', () => {
  it('keeps only the details that are filled in, in the order the footer shows them', () => {
    expect(
      filledDetails({
        tradeName: 'Trade',
        kvk: '12345678',
        vat: 'NL123456789B01',
        address: 'Straat 1, 1234 AB Plaats',
        phone: '+31 6 12345678',
      }),
    ).toEqual([
      { key: 'kvk', value: '12345678' },
      { key: 'vat', value: 'NL123456789B01' },
      { key: 'address', value: 'Straat 1, 1234 AB Plaats' },
      { key: 'phone', value: '+31 6 12345678' },
    ]);
  });

  it('a missing detail shows nothing: not an empty value, not a blank one, not a placeholder', () => {
    expect(filledDetails({ tradeName: 'Trade' })).toEqual([]);
    expect(filledDetails({ tradeName: 'Trade', kvk: '', vat: '   ', phone: undefined })).toEqual(
      [],
    );
    expect(filledDetails({ tradeName: 'Trade', kvk: ' 12345678 ' })).toEqual([
      { key: 'kvk', value: '12345678' },
    ]);
  });

  it('a value that is still a placeholder is a missing one', () => {
    expect(
      filledDetails({ tradeName: 'Trade', kvk: '{{KvK-nummer}}', address: '{{adres}}' }),
    ).toEqual([]);
  });

  it('has a trade name and no placeholder in any value', () => {
    expect(business.tradeName.trim()).not.toBe('');
    for (const value of Object.values(business)) {
      expect(value ?? '').not.toMatch(/\{\{|\}\}|TODO|XXX|tbd/i);
    }
  });
});
