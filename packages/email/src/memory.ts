import type { EmailTransport, OutgoingEmail, SentEmail } from './transport.ts';

export interface CapturedEmail extends OutgoingEmail {
  /** Every `href` in the HTML, in order, e.g. to follow a sign-in link in a test. */
  links: string[];
}

export interface MemoryTransport extends EmailTransport {
  /** Emails sent so far, oldest first. */
  readonly sent: CapturedEmail[];
  /** Errors to throw on the next sends, one per attempt, before sending succeeds again. */
  failNext(...errors: Error[]): void;
  clear(): void;
}

/**
 * Keeps emails in memory instead of sending them: the capture transport for tests and
 * local development (TESTING.md §5.4). Never talks to the network.
 */
export function createMemoryTransport(): MemoryTransport {
  const sent: CapturedEmail[] = [];
  const failures: Error[] = [];
  return {
    name: 'memory',
    sent,
    failNext: (...errors) => {
      failures.push(...errors);
    },
    clear: () => {
      sent.length = 0;
      failures.length = 0;
    },
    send: (email): Promise<SentEmail> => {
      const failure = failures.shift();
      if (failure) return Promise.reject(failure);
      sent.push({ ...email, links: extractLinks(email.html) });
      return Promise.resolve({ messageId: `memory-${sent.length}` });
    },
  };
}

function extractLinks(html: string): string[] {
  return [...html.matchAll(/\shref="([^"]*)"/g)].map(([, href = '']) =>
    href.replaceAll('&amp;', '&'),
  );
}
