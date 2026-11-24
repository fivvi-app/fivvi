import { describe, expect, it } from 'vitest';
import { classDateEmailEvent, privateSessionEmailEvent } from './email-event.ts';

describe('privateSessionEmailEvent', () => {
  it('follows the session and its version', () => {
    const event = privateSessionEmailEvent('session-1', 1);

    expect(privateSessionEmailEvent('session-1', 1)).toBe(event);
    expect(privateSessionEmailEvent('session-1', 2)).not.toBe(event);
    expect(privateSessionEmailEvent('session-2', 1)).not.toBe(event);
  });
});

describe('classDateEmailEvent', () => {
  it('has the key of a private session email, so the keys of EM-05 do not change', () => {
    expect(classDateEmailEvent('date-1', 2, 'client-1')).toBe(
      privateSessionEmailEvent('date-1', 2, 'client-1'),
    );
    expect(classDateEmailEvent('date-1', 2, 'client-1')).toBe('date-1:2:client-1');
  });

  it('follows the date, its version and the client', () => {
    const event = classDateEmailEvent('date-1', 2, 'client-1');

    expect(classDateEmailEvent('date-1', 3, 'client-1')).not.toBe(event);
    expect(classDateEmailEvent('date-2', 2, 'client-1')).not.toBe(event);
    expect(classDateEmailEvent('date-1', 2, 'client-2')).not.toBe(event);
  });
});
