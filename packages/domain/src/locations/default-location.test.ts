import { describe, expect, it } from 'vitest';
import { defaultLocation, LOCATION_NAME_MAX_LENGTH, LOCATION_TYPES } from './default-location.ts';

describe('F015 and F016 locations', () => {
  it('has the six location types of PRODUCT.md §12, and one name limit', () => {
    expect(LOCATION_TYPES).toEqual([
      'organization_location',
      'external_gym',
      'client_home',
      'outdoor',
      'online',
      'other',
    ]);
    expect(LOCATION_NAME_MAX_LENGTH).toBe(120);
  });

  it('F016: the default location of a workspace is its one default', () => {
    const own = { id: 'a', isDefault: true };
    expect(defaultLocation({ locations: [own] })).toBe(own);
    const other = { id: 'b', isDefault: false };
    expect(defaultLocation({ locations: [other, own] })).toBe(own);
  });

  it('F016: a workspace without a default, or with two, is a broken workspace and throws', () => {
    expect(() => defaultLocation({ locations: [] })).toThrow(/exactly one default/);
    expect(() => defaultLocation({ locations: [{ isDefault: false }] })).toThrow(
      /exactly one default/,
    );
    expect(() =>
      defaultLocation({ locations: [{ isDefault: true }, { isDefault: true }] }),
    ).toThrow(/exactly one default/);
  });
});
