import { describe, expect, it, vi } from 'vitest';
import { copyDateLink, copyDateLinkToClipboard, offersBookingLink } from './copy-date-link';

const reply = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

const link = {
  id: 'l1',
  url: 'https://fivvi.app/l/k7p2m9xa',
  scope: 'session',
  language: 'visitor',
  active: true,
  deactivatedAt: null,
  createdAt: '2026-11-10T09:00:00.000Z',
  groupClass: null,
  date: null,
};

describe('F037 CO-01 Boekingslink kopiëren client', () => {
  describe('copyDateLink', () => {
    it("AC8: gets or makes the link of one class date in the visitor's language and returns its URL", async () => {
      const fetchFn = reply(201, { ...link, scope: 'session' });

      const result = await copyDateLink('w1', 's1', fetchFn);

      const [, init] = fetchFn.mock.calls[0] ?? [];
      expect(JSON.parse(String(init?.body))).toEqual({
        scope: 'session',
        language: 'visitor',
        sessionId: 's1',
      });
      expect(result).toEqual({ ok: true, url: link.url });
    });

    it('a date that has started is refused with a plain failure', async () => {
      expect(
        await copyDateLink('w1', 's1', reply(400, { code: 'validation_failed', issues: [] })),
      ).toEqual({ ok: false, reason: 'generic' });
    });
  });
});

describe('F037 copying the link of a class date', () => {
  const stopped = () => vi.unstubAllGlobals();

  it('AC8: puts the date’s short link on the clipboard, in one go with the click (the request runs inside the clipboard item, for Safari)', async () => {
    const written: Blob[] = [];
    class FakeClipboardItem {
      items: Record<string, Promise<Blob>>;
      constructor(items: Record<string, Promise<Blob>>) {
        this.items = items;
      }
    }
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    vi.stubGlobal('navigator', {
      clipboard: {
        write: async (items: FakeClipboardItem[]) => {
          const blob = await items[0]?.items['text/plain'];
          if (blob) written.push(blob);
        },
      },
    });
    try {
      const result = await copyDateLinkToClipboard('w1', 's1', reply(201, { ...link }));

      expect(result).toEqual({ ok: true, url: link.url });
      expect(await written[0]?.text()).toBe(link.url);
    } finally {
      stopped();
    }
  });

  it('AC8: without clipboard items it asks first and then writes the text', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    try {
      const result = await copyDateLinkToClipboard('w1', 's1', reply(200, link));

      expect(result).toEqual({ ok: true, url: link.url });
      expect(writeText).toHaveBeenCalledWith(link.url);
    } finally {
      stopped();
    }
  });

  it('a refused request puts nothing on the clipboard and says why', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    try {
      expect(await copyDateLinkToClipboard('w1', 's1', reply(403))).toEqual({
        ok: false,
        reason: 'forbidden',
      });
      expect(writeText).not.toHaveBeenCalled();
    } finally {
      stopped();
    }
  });

  it('AC8: a clipboard that refuses is "copy", with the link the request got so the page can show it', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('no')) } });
    try {
      expect(await copyDateLinkToClipboard('w1', 's1', reply(200, link))).toEqual({
        ok: false,
        reason: 'copy',
        url: link.url,
      });
    } finally {
      stopped();
    }
  });

  it('AC8: a clipboard item that is refused after the request worked is "copy" with the link', async () => {
    class FakeClipboardItem {
      items: Record<string, Promise<Blob>>;
      constructor(items: Record<string, Promise<Blob>>) {
        this.items = items;
      }
    }
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    vi.stubGlobal('navigator', {
      clipboard: {
        write: async (items: FakeClipboardItem[]) => {
          await items[0]?.items['text/plain'];
          throw new Error('NotAllowedError');
        },
      },
    });
    try {
      expect(await copyDateLinkToClipboard('w1', 's1', reply(201, link))).toEqual({
        ok: false,
        reason: 'copy',
        url: link.url,
      });
    } finally {
      stopped();
    }
  });
});

describe('F037 which class dates offer Boekingslink kopiëren', () => {
  const now = new Date('2026-11-16T12:00:00.000Z');
  const date = (patch: { status?: string; startsAt?: string; type?: string }) => ({
    type: 'group',
    status: 'scheduled',
    startsAt: '2026-11-17T17:00:00.000Z',
    ...patch,
  });

  it('AC8: a scheduled class date in the future does', () => {
    expect(offersBookingLink(date({}), now)).toBe(true);
  });

  it('a cancelled class date does not', () => {
    expect(offersBookingLink(date({ status: 'cancelled' }), now)).toBe(false);
  });

  it('a class date that has started or passed does not', () => {
    expect(offersBookingLink(date({ startsAt: '2026-11-16T12:00:00.000Z' }), now)).toBe(false);
    expect(offersBookingLink(date({ startsAt: '2026-11-10T17:00:00.000Z' }), now)).toBe(false);
  });

  it('a private session never does (PRODUCT.md §15, §17)', () => {
    expect(offersBookingLink(date({ type: 'private' }), now)).toBe(false);
  });
});
