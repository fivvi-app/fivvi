import { describe, expect, it, vi } from 'vitest';
import { LAST_WORKSPACE_COOKIE } from '../../../../server/last-workspace';
import { rememberWorkspace, reportSwitch } from './workspace-client';

describe('F012 reporting a switch', () => {
  it('AC10: posts to the switched route of the workspace, with no body and no token', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));

    await reportSwitch('0197c0de-0000-7000-8000-0000000000a2', fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/workspaces/0197c0de-0000-7000-8000-0000000000a2/switched');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it('never fails the switch: no connection is swallowed', async () => {
    const fetchFn = vi.fn(() => Promise.reject(new TypeError('offline')));

    await expect(reportSwitch('w2', fetchFn)).resolves.toBeUndefined();
  });
});

describe('F012 remembering the last workspace in this browser', () => {
  it('AC4: writes the URL name into the first-party cookie for a year, and nothing else', () => {
    const written: string[] = [];
    const target = {
      set cookie(value: string) {
        written.push(value);
      },
    };

    rememberWorkspace('sarah-personal-training', target, false);

    expect(written).toEqual([
      `${LAST_WORKSPACE_COOKIE}=sarah-personal-training; path=/; max-age=31536000; samesite=lax`,
    ]);
  });

  it('marks the cookie secure on https', () => {
    const written: string[] = [];
    const target = {
      set cookie(value: string) {
        written.push(value);
      },
    };

    rememberWorkspace('johns-gym', target, true);

    expect(written[0]).toMatch(/; secure$/);
  });
});
