import { describe, expect, it } from 'vitest';
import { privateSessionEmailEvent } from './email-event.ts';

describe('privateSessionEmailEvent', () => {
  it('follows the session and its version', () => {
    const event = privateSessionEmailEvent('session-1', 1);

    expect(privateSessionEmailEvent('session-1', 1)).toBe(event);
    expect(privateSessionEmailEvent('session-1', 2)).not.toBe(event);
    expect(privateSessionEmailEvent('session-2', 1)).not.toBe(event);
  });
});
