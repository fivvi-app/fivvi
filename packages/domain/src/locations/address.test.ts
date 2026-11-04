import { describe, expect, it } from 'vitest';
import {
  ADDRESS_ADDITION_MAX_LENGTH,
  ADDRESS_TEXT_MAX_LENGTH,
  decideAddress,
  normalizePostcode,
} from './address.ts';

const FILLED = {
  postcode: '1234 AB',
  houseNumber: '1',
  houseNumberAddition: null,
  street: 'Voorbeeldstraat',
  city: 'Amsterdam',
} as const;

describe('F015 address rules', () => {
  it.each([
    ['1234ab', '1234 AB'],
    ['1234 ab', '1234 AB'],
    ['  1234 AB  ', '1234 AB'],
    ['9999zz', '9999 ZZ'],
  ])('AC15: normalizes the postcode %j to %j', (input, expected) => {
    expect(normalizePostcode(input)).toBe(expected);
  });

  it.each([
    '12345',
    '123 AB',
    '0123 AB',
    '1234 A',
    '1234 ABC',
    '1234-AB',
    '1234  AB',
    'AB 1234',
    '',
  ])('AC15: refuses the postcode %j', (input) => {
    expect(normalizePostcode(input)).toBeUndefined();
  });

  it('AC15: a complete address is accepted with the postcode normalized', () => {
    expect(decideAddress({ ...FILLED, postcode: '1234ab' })).toEqual({
      ok: true,
      address: { ...FILLED, postcode: '1234 AB' },
    });
  });

  it('keeps the addition, trimmed, and stores an empty one as none', () => {
    expect(decideAddress({ ...FILLED, houseNumberAddition: ' 2 hoog ' })).toMatchObject({
      ok: true,
      address: { houseNumberAddition: '2 hoog' },
    });
    expect(decideAddress({ ...FILLED, houseNumberAddition: '  ' })).toMatchObject({
      ok: true,
      address: { houseNumberAddition: null },
    });
    expect(decideAddress({ ...FILLED, houseNumberAddition: undefined })).toMatchObject({
      ok: true,
      address: { houseNumberAddition: null },
    });
  });

  it('trims every field', () => {
    expect(
      decideAddress({
        postcode: ' 1234ab ',
        houseNumber: ' 12 ',
        street: ' Voorbeeldstraat ',
        city: ' Amsterdam ',
      }),
    ).toEqual({
      ok: true,
      address: { ...FILLED, houseNumber: '12' },
    });
  });

  it('AC15: no address at all is accepted: every field empty or the address left out', () => {
    expect(decideAddress(null)).toEqual({ ok: true, address: null });
    expect(decideAddress(undefined)).toEqual({ ok: true, address: null });
    expect(
      decideAddress({
        postcode: '',
        houseNumber: ' ',
        street: '',
        city: '',
        houseNumberAddition: '',
      }),
    ).toEqual({ ok: true, address: null });
  });

  it('AC15: a half-filled address names every missing field', () => {
    expect(decideAddress({ ...FILLED, street: '', city: '  ' })).toEqual({
      ok: false,
      issues: [
        { field: 'street', problem: 'missing' },
        { field: 'city', problem: 'missing' },
      ],
    });
    expect(
      decideAddress({
        postcode: '',
        houseNumber: '',
        street: '',
        city: '',
        houseNumberAddition: 'A',
      }),
    ).toEqual({
      ok: false,
      issues: [
        { field: 'postcode', problem: 'missing' },
        { field: 'houseNumber', problem: 'missing' },
        { field: 'street', problem: 'missing' },
        { field: 'city', problem: 'missing' },
      ],
    });
  });

  it('AC15: a filled postcode that is not Dutch is invalid, not missing', () => {
    expect(decideAddress({ ...FILLED, postcode: '12345' })).toEqual({
      ok: false,
      issues: [{ field: 'postcode', problem: 'invalid' }],
    });
  });

  it.each(['abc', '123456', '1a', '-1', '1.5'])('refuses the house number %j', (houseNumber) => {
    expect(decideAddress({ ...FILLED, houseNumber })).toEqual({
      ok: false,
      issues: [{ field: 'houseNumber', problem: 'invalid' }],
    });
  });

  it.each(['1', '12', '12345'])('accepts the house number %j', (houseNumber) => {
    expect(decideAddress({ ...FILLED, houseNumber })).toMatchObject({ ok: true });
  });

  it('refuses text longer than the limits', () => {
    expect(decideAddress({ ...FILLED, street: 'x'.repeat(ADDRESS_TEXT_MAX_LENGTH + 1) })).toEqual({
      ok: false,
      issues: [{ field: 'street', problem: 'too-long' }],
    });
    expect(decideAddress({ ...FILLED, city: 'x'.repeat(ADDRESS_TEXT_MAX_LENGTH + 1) })).toEqual({
      ok: false,
      issues: [{ field: 'city', problem: 'too-long' }],
    });
    expect(
      decideAddress({
        ...FILLED,
        houseNumberAddition: 'x'.repeat(ADDRESS_ADDITION_MAX_LENGTH + 1),
      }),
    ).toEqual({ ok: false, issues: [{ field: 'houseNumberAddition', problem: 'too-long' }] });
    expect(decideAddress({ ...FILLED, street: 'x'.repeat(ADDRESS_TEXT_MAX_LENGTH) })).toMatchObject(
      { ok: true },
    );
  });
});
