import { describe, expect, it } from 'vitest';
import { decideTrainerProfileSwitch, startsWithTrainerProfile } from './trainer-profile.ts';

describe('F005 trainer profile rules', () => {
  it('AC2: a Trainer always has a trainer profile, from the day the record exists', () => {
    expect(startsWithTrainerProfile('trainer')).toBe(true);
    expect(startsWithTrainerProfile('trainer', { creator: true })).toBe(true);
  });

  it('AC2: becoming Trainer creates it; an Owner who becomes Trainer without one gets one', () => {
    expect(startsWithTrainerProfile('trainer')).toBe(true);
  });

  it('AC2: a Trainer can not switch it off, and nobody else decides it for them', () => {
    expect(decideTrainerProfileSwitch('trainer')).toEqual({
      allowed: false,
      reason: 'trainer-always-trains',
    });
  });

  it('AC3: the creator of a workspace trains from the start', () => {
    expect(startsWithTrainerProfile('owner', { creator: true })).toBe(true);
  });

  it('an Owner who did not create the workspace does not train until they switch it on', () => {
    expect(startsWithTrainerProfile('owner')).toBe(false);
    expect(startsWithTrainerProfile('owner', { creator: false })).toBe(false);
  });

  it('AC2: becoming Owner creates no trainer profile (the Owner decides, AC4)', () => {
    expect(startsWithTrainerProfile('owner')).toBe(false);
  });

  it('AC4: an Owner switches it on and off', () => {
    expect(decideTrainerProfileSwitch('owner')).toEqual({ allowed: true });
  });
});
