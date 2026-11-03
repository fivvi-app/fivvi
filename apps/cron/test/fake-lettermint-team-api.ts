import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeLettermintTeamApi {
  /** For `LETTERMINT_TEAM_API_URL`. */
  url: string;
  /** The `authorization` header of every request, in order. */
  authorizations: (string | undefined)[];
  close(): Promise<void>;
}

/**
 * A stand-in for Lettermint's Team API on the loopback interface (`GET /team` and
 * `GET /team/usage`), so a test can run the cron job against it without any real network.
 * `status` other than 200 answers every request with that error.
 */
export async function startFakeLettermintTeamApi(options: {
  included: number;
  used: number;
  status?: number;
}): Promise<FakeLettermintTeamApi> {
  const authorizations: (string | undefined)[] = [];
  const server = createServer((request, response) => {
    authorizations.push(request.headers.authorization);
    response.setHeader('content-type', 'application/json');
    if (options.status && options.status !== 200) {
      response.writeHead(options.status).end(JSON.stringify({ error: { code: 'UNAVAILABLE' } }));
    } else if (request.url === '/v1/team') {
      response.end(JSON.stringify({ plan: 'free', included_volume: options.included }));
    } else if (request.url === '/v1/team/usage') {
      response.end(
        JSON.stringify({ current_period: { usage: options.used }, historical_usage: [] }),
      );
    } else {
      response.writeHead(404).end('{}');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/v1`,
    authorizations,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
