import { describe, expect, it } from 'vitest';
import { decideAddressLookup } from './address-lookup.ts';

describe('F015 the address lookup query', () => {
  it('AC14: normalizes the postcode and keeps the number and the addition', () => {
    expect(
      decideAddressLookup({ postcode: '1234ab', houseNumber: '12', houseNumberAddition: 'a' }),
    ).toEqual({
      ok: true,
      query: { postcode: '1234 AB', houseNumber: '12', houseNumberAddition: 'a' },
    });
  });

  it.each([undefined, null, '', '   '])('has no addition for %j', (houseNumberAddition) => {
    expect(
      decideAddressLookup({ postcode: '1234 AB', houseNumber: '1', houseNumberAddition }),
    ).toEqual({
      ok: true,
      query: { postcode: '1234 AB', houseNumber: '1', houseNumberAddition: null },
    });
  });

  it('trims every field', () => {
    expect(
      decideAddressLookup({
        postcode: ' 1234 AB ',
        houseNumber: ' 7 ',
        houseNumberAddition: ' 2 hoog ',
      }),
    ).toEqual({
      ok: true,
      query: { postcode: '1234 AB', houseNumber: '7', houseNumberAddition: '2 hoog' },
    });
  });

  it.each([
    ['', 'missing'],
    ['12345', 'invalid'],
    ['0123 AB', 'invalid'],
    ['1234 A', 'invalid'],
  ])('AC14: refuses the postcode %j (%s)', (postcode, problem) => {
    expect(decideAddressLookup({ postcode, houseNumber: '1' })).toEqual({
      ok: false,
      issues: [{ field: 'postcode', problem }],
    });
  });

  it.each([
    ['', 'missing'],
    ['abc', 'invalid'],
    ['1a', 'invalid'],
    ['-1', 'invalid'],
    ['123456', 'invalid'],
  ])('AC14: refuses the house number %j (%s)', (houseNumber, problem) => {
    expect(decideAddressLookup({ postcode: '1234 AB', houseNumber })).toEqual({
      ok: false,
      issues: [{ field: 'houseNumber', problem }],
    });
  });

  it.each([
    ['12345678901', 'too-long'],
    ['a"b', 'invalid'],
    ['a:b', 'invalid'],
    ['*', 'invalid'],
    ['a\\b', 'invalid'],
  ])(
    'refuses the addition %j (%s): nothing that could change the meaning of the query',
    (addition, problem) => {
      expect(
        decideAddressLookup({
          postcode: '1234 AB',
          houseNumber: '1',
          houseNumberAddition: addition,
        }),
      ).toEqual({ ok: false, issues: [{ field: 'houseNumberAddition', problem }] });
    },
  );

  it('reports every problem, in field order', () => {
    expect(
      decideAddressLookup({ postcode: 'x', houseNumber: 'y', houseNumberAddition: '"' }),
    ).toEqual({
      ok: false,
      issues: [
        { field: 'postcode', problem: 'invalid' },
        { field: 'houseNumber', problem: 'invalid' },
        { field: 'houseNumberAddition', problem: 'invalid' },
      ],
    });
  });
});
