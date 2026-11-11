// Checks the public DNS of the sending domain for Lettermint (F049, AC8, ADR-028).
// Usage: pnpm --filter @fivvi/email check:domain [--domain fivvi.app]
// Exits 0 when SPF, DKIM and DMARC (p=quarantine or stricter) are in place, 1 when one is
// not, 2 on bad arguments. Reads public DNS only; no token or secret is used or printed.
import { Resolver } from 'node:dns/promises';
import { runSendingDomainCheck } from '../src/sending-domain-cli.ts';

process.exitCode = await runSendingDomainCheck(process.argv.slice(2), new Resolver(), (line) =>
  console.log(line),
);
