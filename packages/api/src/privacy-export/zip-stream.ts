import { strToU8, Zip, ZipDeflate } from 'fflate';

// A ZIP written as it is produced (E014, spec #477; ADR-010: generated per request, never stored,
// no queue). The producer pushes the files one after the other; the answer's stream asks for more
// only when the reader has taken what is there, so a workspace of any size is exported with a
// bounded amount of memory.

/** How many bytes may wait for the reader before the producer is held back. */
const HIGH_WATER_MARK = 256 * 1024;

export interface ZipWriter {
  /** Adds a file, compressed as its chunks come. The next file starts after this one ends. */
  file(
    name: string,
    chunks: AsyncIterable<string | Uint8Array> | Iterable<string | Uint8Array>,
  ): Promise<void>;
}

/**
 * The stream of a ZIP that `produce` writes. The files get `modified` as their time, so the same
 * data is the same ZIP. A producer that throws fails the stream; a reader that stops (cancel)
 * stops the producer at its next chunk.
 */
export function streamZip(
  modified: Date,
  produce: (zip: ZipWriter) => Promise<void>,
): ReadableStream<Uint8Array> {
  let resume: (() => void) | undefined;
  let cancelled = false;

  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        const emit = async (chunk: Uint8Array) => {
          if (cancelled) throw new Error('The reader stopped reading.');
          controller.enqueue(chunk);
          while (!cancelled && (controller.desiredSize ?? 0) <= 0) {
            await new Promise<void>((resolve) => {
              resume = resolve;
            });
          }
        };
        const pending: Uint8Array[] = [];
        const zip = new Zip((error, chunk) => {
          if (error) throw error;
          pending.push(chunk);
        });
        const flush = async () => {
          for (const chunk of pending.splice(0)) await emit(chunk);
        };
        const writer: ZipWriter = {
          async file(name, chunks) {
            const entry = new ZipDeflate(name, { level: 6 });
            entry.mtime = modified;
            zip.add(entry);
            for await (const chunk of chunks) {
              entry.push(typeof chunk === 'string' ? strToU8(chunk) : chunk, false);
              await flush();
            }
            entry.push(new Uint8Array(0), true);
            await flush();
          },
        };
        produce(writer)
          .then(async () => {
            zip.end();
            await flush();
            controller.close();
          })
          .catch((error: unknown) => {
            if (!cancelled) controller.error(error);
          });
      },
      pull() {
        resume?.();
      },
      cancel() {
        cancelled = true;
        resume?.();
      },
    },
    { highWaterMark: HIGH_WATER_MARK, size: (chunk) => chunk.byteLength },
  );
}
