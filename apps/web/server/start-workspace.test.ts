import { describe, expect, it } from 'vitest';
import { startWorkspace } from './start-workspace';

const gym = { slug: 'johns-gym' };
const personal = { slug: 'sarah-personal-training' };
const studio = { slug: 'studio-zuid' };

// The listing comes by name, as `GET /v1/me` answers it.
describe('F012 the workspace the signed-in home opens', () => {
  it('AC4: the remembered workspace, when the account is still on its team', () => {
    expect(startWorkspace([gym, personal], 'sarah-personal-training')).toBe(personal);
  });

  it('opens the first workspace by name when nothing is remembered', () => {
    expect(startWorkspace([gym, personal], undefined)).toBe(gym);
  });

  it('AC5: a removed remembered workspace is skipped silently: the first by name', () => {
    expect(startWorkspace([gym, studio], 'sarah-personal-training')).toBe(gym);
  });

  it('AC5: with no workspace left there is none to open (the no-access or first-run page)', () => {
    expect(startWorkspace([], 'sarah-personal-training')).toBeUndefined();
    expect(startWorkspace([], undefined)).toBeUndefined();
  });

  it('an empty remembered value is no workspace', () => {
    expect(startWorkspace([gym, personal], '')).toBe(gym);
  });
});
