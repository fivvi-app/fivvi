// The sending-domain check (F049, AC8): reads public DNS for the domain Fivvi sends from and
// reports whether SPF, DKIM and DMARC are in place for Lettermint (ADR-028). It only reads
// DNS; the records are the owner's. Nothing here needs a token, and the report quotes no
// record text beyond Lettermint's own host names and the DMARC policy, so it holds no secret
// and none of the report addresses a DMARC record may carry.

/** The part of a DNS resolver the check uses; `node:dns/promises` fits it, tests fake it. */
export interface DnsResolver {
  resolveTxt(name: string): Promise<string[][]>;
  resolveCname(name: string): Promise<string[]>;
}

export interface CheckResult {
  name: 'SPF' | 'DKIM' | 'DMARC';
  ok: boolean;
  detail: string;
}

export interface SendingDomainReport {
  domain: string;
  ok: boolean;
  checks: CheckResult[];
}

/** Lettermint's mail hosts all live under this domain (Return-Path, SPF and DKIM targets). */
const lettermintZone = 'lmta.net';
const returnPathLabel = 'lm-bounces';
const dkimSelectors = ['lm1', 'lm2'];
const strongPolicies = ['quarantine', 'reject'];

const isLettermintHost = (host: string) => {
  const name = host.replace(/\.$/, '').toLowerCase();
  return name === lettermintZone || name.endsWith(`.${lettermintZone}`);
};

// No record at all is an answer; any other failure (timeout, SERVFAIL) is reported as such.
const noRecordCodes = new Set(['ENODATA', 'ENOTFOUND', 'NXDOMAIN']);

type Lookup<T> = { found: T } | { missing: true } | { error: string };

async function lookup<T>(read: () => Promise<T>): Promise<Lookup<T>> {
  try {
    return { found: await read() };
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && noRecordCodes.has(code)) return { missing: true };
    return { error: typeof code === 'string' ? code : 'lookup failed' };
  }
}

async function txtRecords(resolver: DnsResolver, name: string): Promise<Lookup<string[]>> {
  const answer = await lookup(() => resolver.resolveTxt(name));
  if ('found' in answer) return { found: answer.found.map((chunks) => chunks.join('')) };
  return answer;
}

const describeFailure = (answer: Lookup<unknown>, what: string) =>
  'error' in answer ? `${what} could not be looked up (${answer.error})` : `${what} is missing`;

type Attempt = { ok: true; detail: string } | { ok: false; detail: string };

// Lettermint's SPF lives on the Return-Path host, a CNAME to Lettermint, so the root record
// does not have to change; a root record that includes Lettermint passes as well.
async function spfViaReturnPath(resolver: DnsResolver, domain: string): Promise<Attempt> {
  const host = `${returnPathLabel}.${domain}`;
  const cname = await lookup(() => resolver.resolveCname(host));
  if (!('found' in cname)) {
    return { ok: false, detail: `${describeFailure(cname, `CNAME ${host}`)}` };
  }
  if (!cname.found.some(isLettermintHost)) {
    return { ok: false, detail: `CNAME ${host} does not point to Lettermint (${lettermintZone})` };
  }
  const txt = await txtRecords(resolver, host);
  if (!('found' in txt))
    return { ok: false, detail: describeFailure(txt, `SPF record at ${host}`) };
  const spf = txt.found.filter((record) => /^v=spf1(\s|$)/i.test(record));
  if (spf.length !== 1) {
    return { ok: false, detail: `${host} has ${spf.length} SPF records, expected exactly one` };
  }
  return { ok: true, detail: `${host} -> Lettermint, with one SPF record` };
}

async function spfAtRoot(resolver: DnsResolver, domain: string): Promise<Attempt> {
  const txt = await txtRecords(resolver, domain);
  if (!('found' in txt))
    return { ok: false, detail: describeFailure(txt, `SPF record at ${domain}`) };
  const spf = txt.found.filter((record) => /^v=spf1(\s|$)/i.test(record));
  if (spf.length === 0) return { ok: false, detail: `${domain} has no SPF record` };
  if (spf.length > 1) {
    return { ok: false, detail: `${domain} has ${spf.length} SPF records, expected exactly one` };
  }
  const includesLettermint = spf[0]
    ?.split(/\s+/)
    .some((term) => term.toLowerCase().startsWith('include:') && isLettermintHost(term.slice(8)));
  return includesLettermint
    ? { ok: true, detail: `${domain} has one SPF record that includes Lettermint` }
    : { ok: false, detail: `the SPF record at ${domain} does not include Lettermint` };
}

async function checkSpf(resolver: DnsResolver, domain: string): Promise<CheckResult> {
  const viaReturnPath = await spfViaReturnPath(resolver, domain);
  if (viaReturnPath.ok) return { name: 'SPF', ...viaReturnPath };
  const atRoot = await spfAtRoot(resolver, domain);
  if (atRoot.ok) return { name: 'SPF', ...atRoot };
  return {
    name: 'SPF',
    ok: false,
    detail: `no SPF record for Lettermint: ${viaReturnPath.detail}; ${atRoot.detail}`,
  };
}

async function checkDkim(resolver: DnsResolver, domain: string): Promise<CheckResult> {
  const failures: string[] = [];
  for (const selector of dkimSelectors) {
    const host = `${selector}._domainkey.${domain}`;
    const cname = await lookup(() => resolver.resolveCname(host));
    if (!('found' in cname)) failures.push(describeFailure(cname, `CNAME ${host}`));
    else if (!cname.found.some(isLettermintHost)) {
      failures.push(`CNAME ${host} does not point to Lettermint (${lettermintZone})`);
    }
  }
  return failures.length === 0
    ? { name: 'DKIM', ok: true, detail: `${dkimSelectors.join(' and ')} point to Lettermint` }
    : { name: 'DKIM', ok: false, detail: failures.join('; ') };
}

async function checkDmarc(resolver: DnsResolver, domain: string): Promise<CheckResult> {
  const host = `_dmarc.${domain}`;
  const txt = await txtRecords(resolver, host);
  if (!('found' in txt))
    return { name: 'DMARC', ok: false, detail: describeFailure(txt, `TXT ${host}`) };
  const records = txt.found.filter((record) => /^v=DMARC1\s*(;|$)/i.test(record));
  if (records.length !== 1) {
    return {
      name: 'DMARC',
      ok: false,
      detail: `${host} has ${records.length} DMARC records, expected exactly one`,
    };
  }
  const policy = /(?:^|;)\s*p\s*=\s*([a-z]+)/i.exec(records[0] ?? '')?.[1]?.toLowerCase();
  if (!policy || !strongPolicies.includes(policy)) {
    return {
      name: 'DMARC',
      ok: false,
      detail: `${host} has policy p=${policy ?? '(none set)'}, needs p=quarantine or p=reject`,
    };
  }
  return { name: 'DMARC', ok: true, detail: `${host} has policy p=${policy}` };
}

export async function checkSendingDomain(
  domain: string,
  resolver: DnsResolver,
): Promise<SendingDomainReport> {
  const checks = [
    await checkSpf(resolver, domain),
    await checkDkim(resolver, domain),
    await checkDmarc(resolver, domain),
  ];
  return { domain, ok: checks.every((check) => check.ok), checks };
}

export function formatReport(report: SendingDomainReport): string[] {
  return [
    `Sending domain ${report.domain}: ${report.ok ? 'all records in place' : 'records missing or wrong'}`,
    ...report.checks.map(
      (check) => `${check.ok ? 'PASS' : 'FAIL'}  ${check.name.padEnd(5)}  ${check.detail}`,
    ),
  ];
}
