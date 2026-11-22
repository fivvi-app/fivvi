import { beforeEach, describe, expect, it, vi } from 'vitest';

// F014 WC-07 (ticket #531, AC17): the web records `session_moved_by_drag` after a move made by
// dragging, for an Owner (`calendar.manage`) only, with the workspace ID and the platform and
// nothing else. The move itself is F020's or F022's write; this only counts it.

const track = vi.fn();
const flush = vi.fn(async () => undefined);
const currentMe = vi.fn();
vi.mock('../../../../../../../server/product-events', () => ({
  productEvents: { track, flush },
}));
vi.mock('../../../../../../../server/signed-in', () => ({ currentMe }));

const { POST } = await import('./route');

const OWNER = {
  id: '5d3b9a0e-1c1f-4a52-8f0c-2f4b6c7d8e91',
  workspaces: [
    {
      id: '0b7c2f1a-3a64-4d0e-9c55-6e1b2a3c4d5e',
      slug: 'johns-gym',
      capabilities: ['calendar.read', 'calendar.manage'],
    },
    {
      id: '9a8b7c6d-5e4f-4321-8abc-0d1e2f3a4b5c',
      slug: 'sarahs-gym',
      capabilities: ['calendar.read'],
    },
  ],
};

const call = (slug: string) =>
  POST(new Request('http://localhost/w/x/calendar/moved', { method: 'POST' }), {
    params: Promise.resolve({ slug }),
  });

describe('F014 AC17: session_moved_by_drag from the web', () => {
  beforeEach(() => {
    track.mockClear();
    flush.mockClear();
    currentMe.mockReset();
    currentMe.mockResolvedValue(OWNER);
  });

  it('records the workspace ID and the platform only, for the account of the Owner', async () => {
    const response = await call('johns-gym');

    expect(response.status).toBe(204);
    expect(track).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith({
      event: 'session_moved_by_drag',
      distinctId: OWNER.id,
      properties: { workspace_id: '0b7c2f1a-3a64-4d0e-9c55-6e1b2a3c4d5e', platform: 'web' },
    });
    expect(flush).toHaveBeenCalledOnce();
  });

  it('records nothing for a workspace where the person may only read the calendar', async () => {
    const response = await call('sarahs-gym');

    expect(response.status).toBe(403);
    expect(track).not.toHaveBeenCalled();
  });

  it('records nothing for a workspace that is none of the person’s', async () => {
    const response = await call('fit-studio');

    expect(response.status).toBe(403);
    expect(track).not.toHaveBeenCalled();
  });
});
