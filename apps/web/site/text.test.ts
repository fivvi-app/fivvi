import { describe, expect, it } from 'vitest';
import { isMessageKey } from './text';

describe('F064 isMessageKey', () => {
  it('accepts a path that ends at a text', () => {
    expect(isMessageKey('site.audience.gyms.moments.crew.question')).toBe(true);
    expect(isMessageKey('site.audience.gyms.moments.crew.ticks.a')).toBe(true);
  });

  it('refuses a path to a group, a missing path, and the names every object has', () => {
    expect(isMessageKey('site.audience.gyms.moments.crew')).toBe(false);
    expect(isMessageKey('site.audience.gyms.moments.nobody.question')).toBe(false);
    expect(isMessageKey('site.audience.gyms.moments.crew.question.more')).toBe(false);
    expect(isMessageKey('site.audience.gyms.moments.crew.toString')).toBe(false);
    expect(isMessageKey('')).toBe(false);
  });
});
