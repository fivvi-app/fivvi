import { describe, expect, it, vi } from 'vitest';
import { findClient } from './find-client';

const client = (id: string) => ({ id, name: `Client ${id}`, email: null, emailLocale: null });

describe('F006 TW-02 the client of a profile route', () => {
  it('AC1: finds the client on the first page', async () => {
    const page = vi.fn(async () => ({ items: [client('a'), client('b')], total: 2 }));

    expect(await findClient('b', page)).toEqual(client('b'));
    expect(page).toHaveBeenCalledTimes(1);
  });

  it('keeps reading pages until it finds the client or the list ends', async () => {
    const pages = [
      { items: [client('a')], total: 3 },
      { items: [client('b')], total: 3 },
      { items: [client('c')], total: 3 },
    ];
    const page = vi.fn(async (number: number) => pages[number - 1] ?? { items: [], total: 3 });

    expect(await findClient('c', page, 1)).toEqual(client('c'));
    expect(page.mock.calls.map(([number]) => number)).toEqual([1, 2, 3]);
    page.mockClear();
    expect(await findClient('zz', page, 1)).toBeNull();
    expect(page.mock.calls.map(([number]) => number)).toEqual([1, 2, 3]);
  });

  it('is null for an empty workspace', async () => {
    expect(await findClient('a', async () => ({ items: [], total: 0 }))).toBeNull();
  });
});
