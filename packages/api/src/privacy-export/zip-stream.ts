import { strToU8, Zip, ZipDeflate } from 'fflate';

// A ZIP written as it is produced (E014, spec #477; ADR-010: generated per request, never stored,
// no queue). The producer pushes the files one after the other; the answer's stream asks for more
// only when the reader has taken what is there, so a workspace of any size is exported with a
// bounded amount of memory.

/** How many bytes may wait for the reader before the producer is held back. */
const HIGH_WATER_MARK = 256 * 1024;

/** How long the producer waits for a reader that takes nothing before the stream is given up on. */
const STALL_TIMEOUT_MS = 60_000;

export interface ZipWriter {
  /** Adds a file, compressed as its chunks come. The next file starts after this one ends. */
  file(
    name: string,
    chunks: AsyncIterable<string | Uint8Array> | Iterable<string | Uint8Array>,
  ): Promise<void>;
}

export interface StreamZipOptions {
  /**
   * The producer starts when this resolves, not before: a producer that holds a database
   * transaction must not open it until the request that answers with the stream has committed. If
   * it rejects the stream fails without starting the producer; if it never settles and the reader
   * leaves, the producer never starts.
   */
  startWhen?: Promise<void>;
  /** How long the producer may wait for a reader that takes nothing: then the stream fails. */
  stallTimeoutMs?: number;
  /** Told of the error that ends the stream (not of a reader that leaves), to report it. */
  onError?: (error: unknown) => void;
}

/**
 * The stream of a ZIP that `produce` writes. The files get `modified` as their time, so the same
 * data is the same ZIP. A producer that throws fails the stream; a reader that stops (cancel)
 * stops the producer at its next chunk; a reader that takes nothing for `stallTimeoutMs` fails the
 * stream and stops the producer, so what it holds (a transaction) is released.
 */
export function streamZip(
  modified: Date,
  produce: (zip: ZipWriter) => Promise<void>,
  options: StreamZipOptions = {},
): ReadableStream<Uint8Array> {
  const stallTimeoutMs = options.stallTimeoutMs ?? STALL_TIMEOUT_MS;
  let resume: (() => void) | undefined;
  let cancelled = false;
  let leave: () => void = () => {};
  const left = new Promise<void>((resolve) => {
    leave = resolve;
  });

  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        const emit = async (chunk: Uint8Array) => {
          if (cancelled) throw new Error('The reader stopped reading.');
          controller.enqueue(chunk);
          while (!cancelled && (controller.desiredSize ?? 0) <= 0) {
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(
                () => reject(new Error('The reader did not read the export in time.')),
                stallTimeoutMs,
              );
              resume = () => {
                clearTimeout(timer);
                resolve();
              };
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
        Promise.race([options.startWhen ?? Promise.resolve(), left])
          .then(async () => {
            if (cancelled) return;
            await produce(writer);
            zip.end();
            await flush();
            controller.close();
          })
          .catch((error: unknown) => {
            if (cancelled) return;
            // The stream fails first, so a reporter that throws does not leave the reader waiting.
            controller.error(error);
            try {
              options.onError?.(error);
            } catch {
              // Reporting is best effort: the stream has failed either way.
            }
          });
      },
      pull() {
        resume?.();
      },
      cancel() {
        cancelled = true;
        leave();
        resume?.();
      },
    },
    { highWaterMark: HIGH_WATER_MARK, size: (chunk) => chunk.byteLength },
  );
}
