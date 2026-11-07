import { describe, expect, it } from 'vitest';
import { refusedFields } from './validation-issues';

describe('refusedFields', () => {
  it('words too_big as tooLong and any other code as required', () => {
    const body = {
      issues: [
        { path: 'name', code: 'too_big' },
        { path: 'personName', code: 'too_small' },
      ],
    };
    expect(refusedFields(body)).toEqual({ name: 'tooLong', personName: 'required' });
  });

  it('is empty when the body names no issues', () => {
    expect(refusedFields(null)).toEqual({});
    expect(refusedFields({ issues: 'x' })).toEqual({});
    expect(refusedFields({ issues: [{ code: 'too_big' }] })).toEqual({});
  });
});
