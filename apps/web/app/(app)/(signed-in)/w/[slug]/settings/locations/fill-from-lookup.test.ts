import { describe, expect, it } from 'vitest';
import { clearLookupFilled, fillFromLookup } from './fill-from-lookup';

const found = { street: 'Proeflaan', city: 'Haarlem' };

describe('F015 TW-08 filling street and city from a lookup', () => {
  it('AC13: fills empty fields and marks them as filled by a lookup', () => {
    expect(
      fillFromLookup({ street: '', city: '', streetFilled: false, cityFilled: false }, found),
    ).toEqual({ street: 'Proeflaan', city: 'Haarlem', streetFilled: true, cityFilled: true });
  });

  it('AC13: replaces what an earlier lookup filled', () => {
    expect(
      fillFromLookup(
        { street: 'Voorbeeldstraat', city: 'Amsterdam', streetFilled: true, cityFilled: true },
        found,
      ),
    ).toEqual({ street: 'Proeflaan', city: 'Haarlem', streetFilled: true, cityFilled: true });
  });

  it('AC13: keeps a field the Owner typed and replaces the other', () => {
    expect(
      fillFromLookup(
        { street: 'Mijn eigen straat', city: 'Amsterdam', streetFilled: false, cityFilled: true },
        found,
      ),
    ).toEqual({
      street: 'Mijn eigen straat',
      city: 'Haarlem',
      streetFilled: false,
      cityFilled: true,
    });
  });

  it('AC13: keeps both typed fields, and marks nothing as filled', () => {
    const typed = { street: 'A', city: 'B', streetFilled: false, cityFilled: false };

    expect(fillFromLookup(typed, found)).toEqual(typed);
  });

  it('a field that holds only spaces counts as empty', () => {
    expect(
      fillFromLookup({ street: '  ', city: 'B', streetFilled: false, cityFilled: false }, found),
    ).toEqual({ street: 'Proeflaan', city: 'B', streetFilled: true, cityFilled: false });
  });
});

describe('F015 TW-08 emptying what a lookup filled', () => {
  it('AC13: empties the fields a lookup filled and drops their marks', () => {
    expect(
      clearLookupFilled({
        street: 'Voorbeeldstraat',
        city: 'Amsterdam',
        streetFilled: true,
        cityFilled: true,
      }),
    ).toEqual({ street: '', city: '', streetFilled: false, cityFilled: false });
  });

  it('AC13: never touches a field the Owner typed', () => {
    expect(
      clearLookupFilled({
        street: 'Mijn eigen straat',
        city: 'Amsterdam',
        streetFilled: false,
        cityFilled: true,
      }),
    ).toEqual({ street: 'Mijn eigen straat', city: '', streetFilled: false, cityFilled: false });
  });

  it('keeps a form with nothing filled by a lookup as it is', () => {
    const typed = { street: 'A', city: 'B', streetFilled: false, cityFilled: false };

    expect(clearLookupFilled(typed)).toEqual(typed);
  });
});
