import { randomBytes } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { streamZip } from './zip-stream.ts';

async function bytesOf(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe('E014 export: the ZIP is streamed, never held whole', () => {
  it('writes the files in order, readable by any unzip tool', async () => {
    const stream = streamZip(new Date('2026-11-27T09:00:00.000Z'), async (zip) => {
      await zip.file('README.txt', ['Hello ', 'José']);
      await zip.file('data.csv', ['\uFEFFid,name\r\n']);
    });
    const files = unzipSync(await bytesOf(stream));
    expect(Object.keys(files)).toEqual(['README.txt', 'data.csv']);
    expect(strFromU8(files['README.txt'] as Uint8Array)).toBe('Hello José');
    // The byte order mark is kept: Excel needs it, so it is read back without dropping it.
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(files['data.csv'])).toBe(
      '\uFEFFid,name\r\n',
    );
  });

  it('holds back the producer while the reader is slow: memory stays bounded', async () => {
    let produced = 0;
    const stream = streamZip(new Date(), async (zip) => {
      await zip.file(
        'big.txt',
        (function* () {
          for (let i = 0; i < 400; i += 1) {
            produced += 1;
            yield randomBytes(100_000).toString('base64');
          }
        })(),
      );
    });
    const reader = stream.getReader();
    await reader.read();
    // Give the producer time to run as far as it is allowed to.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(produced).toBeLessThan(400);
    await reader.cancel();
  });

  it('a producer that fails fails the stream', async () => {
    const stream = streamZip(new Date(), () => Promise.reject(new Error('boom')));
    await expect(bytesOf(stream)).rejects.toThrow('boom');
  });
});

const never = () => new Promise<void>(() => {});

describe('E014 export: the producer starts only when it may, and never waits for ever', () => {
  it('does not start the producer before the go-ahead, and starts it after', async () => {
    let go: () => void = () => {};
    const produce = vi.fn(async (zip: Parameters<Parameters<typeof streamZip>[1]>[0]) => {
      await zip.file('a.txt', ['a']);
    });
    const stream = streamZip(new Date(), produce, {
      startWhen: new Promise<void>((resolve) => {
        go = resolve;
      }),
    });
    const read = bytesOf(stream);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(produce).not.toHaveBeenCalled();

    go();

    expect(Object.keys(unzipSync(await read))).toEqual(['a.txt']);
    expect(produce).toHaveBeenCalledTimes(1);
  });

  it('never starts the producer when the go-ahead never comes and the reader leaves', async () => {
    const produce = vi.fn(() => Promise.resolve());
    const stream = streamZip(new Date(), produce, { startWhen: never() });
    const reader = stream.getReader();
    const pending = reader.read();
    await reader.cancel();
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(produce).not.toHaveBeenCalled();
  });

  it('fails the stream, without starting, when the go-ahead fails', async () => {
    const produce = vi.fn(() => Promise.resolve());
    const reported: unknown[] = [];
    const stream = streamZip(new Date(), produce, {
      startWhen: Promise.reject(new Error('no commit')),
      onError: (error) => reported.push(error),
    });

    await expect(bytesOf(stream)).rejects.toThrow('no commit');
    expect(produce).not.toHaveBeenCalled();
    expect(reported).toHaveLength(1);
  });

  it('ends the stream with an error, and stops the producer, when the reader stalls', async () => {
    let producerError: unknown;
    const reported: unknown[] = [];
    // The stall can only begin once the producer has filled the stream's queue, and how long that
    // takes depends on the machine; so the test waits for the error itself, not for a fixed time.
    let ended: () => void = () => {};
    const stalled = new Promise<void>((resolve) => {
      ended = resolve;
    });
    const stream = streamZip(
      new Date(),
      async (zip) => {
        try {
          await zip.file(
            'big.txt',
            (function* () {
              for (let i = 0; i < 400; i += 1) yield randomBytes(100_000).toString('base64');
            })(),
          );
        } catch (error) {
          producerError = error;
          throw error;
        }
      },
      {
        stallTimeoutMs: 30,
        onError: (error) => {
          reported.push(error);
          ended();
        },
      },
    );
    const reader = stream.getReader();
    await reader.read();
    // The reader reads nothing more: the producer is held back, then given up on.
    await stalled;

    expect(producerError).toBeInstanceOf(Error);
    expect((producerError as Error).message).toMatch(/not read/);
    expect(reported).toEqual([producerError]);
    await expect(
      (async () => {
        for (;;) if ((await reader.read()).done) return;
      })(),
    ).rejects.toThrow(/not read/);
  });

  it('does not give up on a reader that keeps reading, however slowly', async () => {
    const stream = streamZip(
      new Date(),
      async (zip) => {
        await zip.file(
          'big.txt',
          (function* () {
            for (let i = 0; i < 12; i += 1) yield randomBytes(100_000).toString('base64');
          })(),
        );
      },
      { stallTimeoutMs: 5_000 },
    );
    const reader = stream.getReader();
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(total).toBeGreaterThan(0);
  });

  it('reports a producer that fails, but not a reader that leaves', async () => {
    const reported: unknown[] = [];
    const failing = streamZip(new Date(), () => Promise.reject(new Error('boom')), {
      onError: (error) => reported.push(error),
    });
    await expect(bytesOf(failing)).rejects.toThrow('boom');
    expect(reported).toHaveLength(1);
    expect((reported[0] as Error).message).toBe('boom');

    const left: unknown[] = [];
    const leaving = streamZip(
      new Date(),
      async (zip) => {
        await zip.file(
          'big.txt',
          (function* () {
            for (let i = 0; i < 400; i += 1) yield randomBytes(100_000).toString('base64');
          })(),
        );
      },
      { onError: (error) => left.push(error) },
    );
    const reader = leaving.getReader();
    await reader.read();
    await reader.cancel();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(left).toEqual([]);
  });
});
