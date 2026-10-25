import { describe, expect, it } from 'vitest';
import { maskEmail } from './sign-in-plugin.ts';

describe('F001 the masked address of the confirm step (TW-10)', () => {
  it('keeps the first character and the whole domain', () => {
    expect(maskEmail('jan.jansen@example.com')).toBe('j***@example.com');
  });

  it('hides the length of the part before the @', () => {
    expect(maskEmail('a.very.long.address@example.com')).toBe('a***@example.com');
    expect(maskEmail('a@example.com')).toBe('a***@example.com');
  });

  it('keeps a first character outside the basic alphabet whole', () => {
    expect(maskEmail('émilie@example.com')).toBe('é***@example.com');
    expect(maskEmail('😀x@example.com')).toBe('😀***@example.com');
  });

  it('masks by the last @ so a quoted local part never leaks its tail', () => {
    expect(maskEmail('"a@b"@example.com')).toBe('"***@example.com');
  });
});
