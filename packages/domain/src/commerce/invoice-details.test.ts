import { describe, expect, it } from 'vitest';
import {
  decideBillingDetails,
  decideInvoiceDetails,
  isInvoiceDetailsComplete,
  isKvkNumber,
  isVatNumber,
} from './invoice-details.ts';

// Synthetic: John's Gym B.V. (spec #474).
const DETAILS = {
  legalName: "John's Gym B.V.",
  street: 'Voorbeeldstraat',
  houseNumber: '1',
  houseNumberAddition: null,
  postcode: '1234 AB',
  city: 'Amsterdam',
  kvkNumber: '12345678',
  vatNumber: 'NL000000000B01',
} as const;

const BILLING = {
  asCompany: true,
  companyName: 'Jansen Advies B.V.',
  street: 'Testweg',
  houseNumber: '2',
  houseNumberAddition: null,
  postcode: '5678 CD',
  city: 'Utrecht',
  vatNumber: 'NL000000000B02',
} as const;

describe('F059 KvK and VAT number formats', () => {
  it.each(['12345678', '00000000'])('AC2: accepts the KvK number %j', (value) => {
    expect(isKvkNumber(value)).toBe(true);
  });

  it.each(['1234567', '123456789', '1234567a', '1234 5678', '', '１２３４５６７８'])(
    'AC2: refuses the KvK number %j',
    (value) => {
      expect(isKvkNumber(value)).toBe(false);
    },
  );

  it.each(['NL000000000B01', 'NL123456789B99'])('AC2: accepts the VAT number %j', (value) => {
    expect(isVatNumber(value)).toBe(true);
  });

  it.each([
    'NL00000000B01',
    'NL0000000000B01',
    'NL000000000B1',
    'NL000000000B001',
    'NL000000000X01',
    'BE000000000B01',
    'nl000000000b01',
    'NL000000000B01 ',
    '000000000B01',
    '',
  ])('AC2: refuses the VAT number %j', (value) => {
    expect(isVatNumber(value)).toBe(false);
  });
});

describe('F059 invoice details', () => {
  it('AC2: complete details pass', () => {
    expect(decideInvoiceDetails(DETAILS)).toEqual({ ok: true, details: DETAILS });
    expect(isInvoiceDetailsComplete(DETAILS)).toBe(true);
  });

  it('trims the text, normalizes the postcode and writes the VAT number in capitals', () => {
    expect(
      decideInvoiceDetails({
        ...DETAILS,
        legalName: "  John's Gym B.V.  ",
        postcode: '1234ab',
        kvkNumber: ' 12345678 ',
        vatNumber: ' nl000000000b01 ',
      }),
    ).toEqual({ ok: true, details: DETAILS });
  });

  it('AC2: a KvK number that is not 8 digits is rejected with its own error code', () => {
    expect(decideInvoiceDetails({ ...DETAILS, kvkNumber: '1234567' })).toEqual({
      ok: false,
      issues: [{ field: 'kvkNumber', code: 'invalid_kvk_number' }],
    });
  });

  it('AC2: a VAT number not of the form NL + 9 digits + B + 2 digits is rejected with its own error code', () => {
    expect(decideInvoiceDetails({ ...DETAILS, vatNumber: 'NL12345678B01' })).toEqual({
      ok: false,
      issues: [{ field: 'vatNumber', code: 'invalid_vat_number' }],
    });
  });

  it('requires the legal name, street and number, postcode, city, KvK and VAT number', () => {
    const empty = {
      legalName: '',
      street: ' ',
      houseNumber: '',
      houseNumberAddition: null,
      postcode: '',
      city: '',
      kvkNumber: '',
      vatNumber: '',
    };
    const decision = decideInvoiceDetails(empty);
    expect(decision).toEqual({
      ok: false,
      issues: [
        { field: 'legalName', code: 'required' },
        { field: 'postcode', code: 'required' },
        { field: 'houseNumber', code: 'required' },
        { field: 'street', code: 'required' },
        { field: 'city', code: 'required' },
        { field: 'kvkNumber', code: 'required' },
        { field: 'vatNumber', code: 'required' },
      ],
    });
    expect(isInvoiceDetailsComplete(empty)).toBe(false);
  });

  it('rejects a postcode and a house number in the wrong format', () => {
    expect(decideInvoiceDetails({ ...DETAILS, postcode: '12345', houseNumber: 'x' })).toEqual({
      ok: false,
      issues: [
        { field: 'postcode', code: 'invalid' },
        { field: 'houseNumber', code: 'invalid' },
      ],
    });
  });

  it('keeps the house number addition, and bounds the length of the text', () => {
    expect(decideInvoiceDetails({ ...DETAILS, houseNumberAddition: ' 2 hoog ' })).toMatchObject({
      ok: true,
      details: { houseNumberAddition: '2 hoog' },
    });
    expect(decideInvoiceDetails({ ...DETAILS, legalName: 'x'.repeat(121) })).toEqual({
      ok: false,
      issues: [{ field: 'legalName', code: 'too_long' }],
    });
    expect(decideInvoiceDetails({ ...DETAILS, city: 'x'.repeat(121) })).toEqual({
      ok: false,
      issues: [{ field: 'city', code: 'too_long' }],
    });
    expect(decideInvoiceDetails({ ...DETAILS, houseNumberAddition: 'x'.repeat(11) })).toEqual({
      ok: false,
      issues: [{ field: 'houseNumberAddition', code: 'too_long' }],
    });
  });

  it('no details at all are incomplete', () => {
    expect(isInvoiceDetailsComplete(null)).toBe(false);
    expect(isInvoiceDetailsComplete(undefined)).toBe(false);
  });
});

describe('F059 billing details', () => {
  it('a company invoice with a company name, address and VAT number passes', () => {
    expect(decideBillingDetails(BILLING)).toEqual({
      ok: true,
      billing: {
        companyName: 'Jansen Advies B.V.',
        street: 'Testweg',
        houseNumber: '2',
        houseNumberAddition: null,
        postcode: '5678 CD',
        city: 'Utrecht',
        vatNumber: 'NL000000000B02',
      },
    });
  });

  it.each([null, undefined, '', '   '])('an empty VAT number (%j) is accepted', (vatNumber) => {
    expect(decideBillingDetails({ ...BILLING, vatNumber })).toMatchObject({
      ok: true,
      billing: { vatNumber: null },
    });
  });

  it('a VAT number that is given has the same format as the seller one', () => {
    expect(decideBillingDetails({ ...BILLING, vatNumber: 'NL000000000X02' })).toEqual({
      ok: false,
      issues: [{ field: 'vatNumber', code: 'invalid_vat_number' }],
    });
  });

  it('a company invoice without a company name or address is rejected', () => {
    expect(
      decideBillingDetails({
        asCompany: true,
        companyName: ' ',
        street: '',
        houseNumber: '',
        postcode: '',
        city: '',
        vatNumber: '',
      }),
    ).toEqual({
      ok: false,
      issues: [
        { field: 'companyName', code: 'required' },
        { field: 'postcode', code: 'required' },
        { field: 'houseNumber', code: 'required' },
        { field: 'street', code: 'required' },
        { field: 'city', code: 'required' },
      ],
    });
    expect(decideBillingDetails({ ...BILLING, companyName: '' })).toEqual({
      ok: false,
      issues: [{ field: 'companyName', code: 'required' }],
    });
    expect(decideBillingDetails({ ...BILLING, city: '' })).toEqual({
      ok: false,
      issues: [{ field: 'city', code: 'required' }],
    });
  });

  it('with the company switch off the invoice uses the client name and nothing is checked', () => {
    expect(
      decideBillingDetails({
        asCompany: false,
        companyName: '',
        street: '',
        houseNumber: '',
        postcode: 'x',
        city: '',
        vatNumber: 'nonsense',
      }),
    ).toEqual({ ok: true, billing: null });
  });
});
