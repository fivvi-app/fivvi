import { describe, expect, it } from 'vitest';
import { NAME_MAX_LENGTH, PERSON_NAME_MAX_LENGTH } from './defaults.ts';

describe('F030 AC4: how long a name may be', () => {
  it('lets a person’s own name take up to 120 characters, as a client name does', () => {
    expect(PERSON_NAME_MAX_LENGTH).toBe(120);
  });

  it('keeps a workspace name at 80 characters', () => {
    expect(NAME_MAX_LENGTH).toBe(80);
  });
});
