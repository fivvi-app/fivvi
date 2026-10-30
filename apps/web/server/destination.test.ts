import { describe, expect, it } from 'vitest';
import { destinationOf, pathOf } from './destination';

const gym = {
  id: '0197c0de-0000-7000-8000-0000000000a1',
  name: "John's Gym",
  slug: 'johns-gym',
  role: 'owner',
  capabilities: [] as never[],
} as const;
const studio = {
  id: '0197c0de-0000-7000-8000-0000000000a2',
  name: 'Studio Zuid',
  slug: 'studio-zuid',
  role: 'trainer',
  capabilities: [] as never[],
} as const;

describe('F002 where the signed-in home sends a person', () => {
  it('AC1: no workspace and allowed to create one: TW-11', () => {
    const destination = destinationOf({ canCreateWorkspace: true, workspaces: [] });

    expect(destination).toEqual({ to: 'welcome' });
    expect(pathOf(destination)).toBe('/welcome');
  });

  it('AC5: no workspace and not allowed to create one: the no-access page, never TW-11', () => {
    const destination = destinationOf({ canCreateWorkspace: false, workspaces: [] });

    expect(destination).toEqual({ to: 'no-access' });
    expect(pathOf(destination)).toBe('/home');
  });

  it('AC4: one workspace: its home', () => {
    const destination = destinationOf({ canCreateWorkspace: false, workspaces: [gym] });

    expect(destination).toEqual({ to: 'workspace', slug: 'johns-gym' });
    expect(pathOf(destination)).toBe('/w/johns-gym');
  });

  it('a workspace wins over the right to create one (the API never says both)', () => {
    expect(destinationOf({ canCreateWorkspace: true, workspaces: [gym] })).toEqual({
      to: 'workspace',
      slug: 'johns-gym',
    });
  });

  it('with several workspaces it goes to the first, until F012 remembers the last one used', () => {
    expect(destinationOf({ canCreateWorkspace: false, workspaces: [gym, studio] })).toEqual({
      to: 'workspace',
      slug: 'johns-gym',
    });
  });
});
