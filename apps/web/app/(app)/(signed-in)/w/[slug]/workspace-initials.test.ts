import { describe, expect, it } from 'vitest';
import { initials } from './workspace-initials';

// E020 #626: the letters in the sidebar header's logo square and the person's avatar.
describe('E020 initials', () => {
  it('takes the first letter of the first two words, in capitals', () => {
    expect(initials("John's Gym")).toBe('JG');
    expect(initials('sarah personal training')).toBe('SP');
  });

  it('takes the first two letters of a single word', () => {
    expect(initials('Fivvi')).toBe('FI');
    expect(initials('X')).toBe('X');
  });

  it('keeps a letter with an accent whole, ignores extra spaces and gives nothing for nothing', () => {
    expect(initials('  Éva   de Vries ')).toBe('ÉD');
    expect(initials('   ')).toBe('');
  });
});
