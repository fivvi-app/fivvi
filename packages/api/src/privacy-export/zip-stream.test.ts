import { randomBytes } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
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
