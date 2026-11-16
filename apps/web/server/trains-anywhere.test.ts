import { describe, expect, it, vi } from 'vitest';
import { trainsAnywhere } from './trains-anywhere';

const gym = { role: 'owner' } as const;
const studio = { role: 'trainer' } as const;

describe('F013 AC9, AC12: who has the personal pages (a trainer profile in at least one workspace)', () => {
  it('a Trainer always trains, so the API is not asked', async () => {
    const trainsHere = vi.fn(() => Promise.resolve([{ trainsHere: false }]));

    await expect(trainsAnywhere([gym, studio], trainsHere)).resolves.toBe(true);
    expect(trainsHere).not.toHaveBeenCalled();
  });

  it('an Owner trains when their own switch is on in any of their workspaces', async () => {
    await expect(
      trainsAnywhere([gym, gym], () =>
        Promise.resolve([{ trainsHere: false }, { trainsHere: true }]),
      ),
    ).resolves.toBe(true);
  });

  it('an Owner who does not train has no personal pages', async () => {
    await expect(
      trainsAnywhere([gym], () => Promise.resolve([{ trainsHere: false }])),
    ).resolves.toBe(false);
  });

  it('an account on no team, such as a client, has none and asks nothing', async () => {
    const trainsHere = vi.fn(() => Promise.resolve([]));

    await expect(trainsAnywhere([], trainsHere)).resolves.toBe(false);
    expect(trainsHere).not.toHaveBeenCalled();
  });
});
