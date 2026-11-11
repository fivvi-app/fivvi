import { parseArgs } from 'node:util';
import { checkSendingDomain, type DnsResolver, formatReport } from './sending-domain.ts';

export const defaultSendingDomain = 'fivvi.app';

const usage =
  'Usage: pnpm --filter @fivvi/email check:domain [--domain <domain>] (default fivvi.app)';

/** Runs the check and returns the exit code: 0 all records pass, 1 a record fails, 2 bad usage. */
export async function runSendingDomainCheck(
  args: string[],
  resolver: DnsResolver,
  write: (line: string) => void,
): Promise<number> {
  let domain: string;
  try {
    const { values } = parseArgs({
      args,
      options: { domain: { type: 'string', default: defaultSendingDomain } },
    });
    domain = values.domain.trim().toLowerCase();
  } catch (error) {
    write((error as Error).message);
    write(usage);
    return 2;
  }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
    write(`"${domain}" is not a domain name.`);
    write(usage);
    return 2;
  }
  const report = await checkSendingDomain(domain, resolver);
  for (const line of formatReport(report)) write(line);
  return report.ok ? 0 : 1;
}
