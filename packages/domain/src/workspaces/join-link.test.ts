import { describe, expect, it } from 'vitest';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, joinLinkUrl } from './join-link.ts';

describe('F029 the join link of a workspace', () => {
  it('AC6: the link is the app address, /j/ and the code', () => {
    expect(joinLinkUrl('https://fivvi.app', '7KQ2M9XA')).toBe('https://fivvi.app/j/7KQ2M9XA');
  });

  it('AC6: a trailing slash on the address does not double', () => {
    expect(joinLinkUrl('https://fivvi.app/', '7KQ2M9XA')).toBe('https://fivvi.app/j/7KQ2M9XA');
  });

  it('a code is 8 characters of the 32 symbols of Crockford’s base32, without I, L, O and U', () => {
    expect(JOIN_CODE_LENGTH).toBe(8);
    const digits = Array.from({ length: 10 }, (_, digit) => String(digit));
    const letters = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
    const symbols = [...digits, ...letters.filter((letter) => !'ILOU'.includes(letter))];
    expect(symbols).toHaveLength(32);
    expect([...JOIN_CODE_ALPHABET]).toEqual(symbols);
  });
});
