import { describe, expect, it } from 'vitest';
import { checkSendingDomain, type DnsResolver } from './sending-domain.ts';
import { runSendingDomainCheck } from './sending-domain-cli.ts';

type Zone = Record<string, { txt?: string[]; cname?: string[] }>;

// A fake DNS answer: the tests never touch the network. Like a real resolver, a name
// that is a CNAME answers a TXT query with the TXT records of its target.
function fakeResolver(zone: Zone, failWith?: { name: string; code: string }): DnsResolver {
  const reject = (message: string, code: string) =>
    Promise.reject(Object.assign(new Error(message), { code }));
  const answer = <T>(name: string, read: (entry: Zone[string]) => T | undefined): Promise<T> => {
    if (failWith && name === failWith.name)
      return reject(`query failed for ${name}`, failWith.code);
    const entry = zone[name];
    if (!entry) return reject(`not found: ${name}`, 'ENOTFOUND');
    const value = read(entry);
    return value === undefined ? reject(`no data: ${name}`, 'ENODATA') : Promise.resolve(value);
  };
  return {
    resolveTxt: (name) => answer(name, ({ txt }) => txt?.map((record) => [record])),
    resolveCname: (name) => answer(name, ({ cname }) => cname),
  };
}

// Lettermint's records for fivvi.app (ADR-028): Return-Path and DKIM are CNAMEs to lmta.net.
const lettermintSpf = 'v=spf1 ip4:192.0.2.0/24 ip4:198.51.100.0/24 -all';
const healthy: Zone = {
  'lm-bounces.fivvi.app': { cname: ['bounces.lmta.net'], txt: [lettermintSpf] },
  'lm1._domainkey.fivvi.app': { cname: ['lm1.abc123.dkim.lmta.net'] },
  'lm2._domainkey.fivvi.app': { cname: ['lm2.abc123.dkim.lmta.net'] },
  '_dmarc.fivvi.app': { txt: ['v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com'] },
};

const without = (zone: Zone, name: string): Zone =>
  Object.fromEntries(Object.entries(zone).filter(([key]) => key !== name));

describe('F049 AC8: sending-domain check', () => {
  it('reports SPF, DKIM and DMARC as passing for a Lettermint setup', async () => {
    const report = await checkSendingDomain('fivvi.app', fakeResolver(healthy));

    expect(report.ok).toBe(true);
    expect(report.checks.map(({ name, ok }) => [name, ok])).toEqual([
      ['SPF', true],
      ['DKIM', true],
      ['DMARC', true],
    ]);
  });

  it('accepts a root SPF record that includes Lettermint', async () => {
    const zone = {
      ...without(healthy, 'lm-bounces.fivvi.app'),
      'fivvi.app': { txt: ['v=spf1 include:spf.lmta.net -all'] },
    };
    const report = await checkSendingDomain('fivvi.app', fakeResolver(zone));

    expect(report.checks.find((check) => check.name === 'SPF')?.ok).toBe(true);
  });

  it('accepts p=reject as well', async () => {
    const zone = { ...healthy, '_dmarc.fivvi.app': { txt: ['v=DMARC1; p=reject'] } };

    expect((await checkSendingDomain('fivvi.app', fakeResolver(zone))).ok).toBe(true);
  });

  it('fails SPF when the record does not include Lettermint', async () => {
    const zone = {
      ...without(healthy, 'lm-bounces.fivvi.app'),
      'fivvi.app': { txt: ['v=spf1 include:_spf.example.com -all'] },
    };
    const report = await checkSendingDomain('fivvi.app', fakeResolver(zone));
    const spf = report.checks.find((check) => check.name === 'SPF');

    expect(report.ok).toBe(false);
    expect(spf?.ok).toBe(false);
    expect(spf?.detail).toContain('Lettermint');
  });

  it('fails SPF when the Return-Path CNAME points somewhere that is not Lettermint', async () => {
    const zone = {
      ...healthy,
      'lm-bounces.fivvi.app': { cname: ['bounces.example.com'], txt: [lettermintSpf] },
    };

    expect((await checkSendingDomain('fivvi.app', fakeResolver(zone))).ok).toBe(false);
  });

  it('fails SPF on two SPF records at the root, which receivers reject', async () => {
    const zone = {
      ...without(healthy, 'lm-bounces.fivvi.app'),
      'fivvi.app': {
        txt: ['v=spf1 include:spf.lmta.net -all', 'v=spf1 include:other.example -all'],
      },
    };

    expect((await checkSendingDomain('fivvi.app', fakeResolver(zone))).ok).toBe(false);
  });

  it('names a missing DKIM record', async () => {
    const report = await checkSendingDomain(
      'fivvi.app',
      fakeResolver(without(healthy, 'lm2._domainkey.fivvi.app')),
    );
    const dkim = report.checks.find((check) => check.name === 'DKIM');

    expect(report.ok).toBe(false);
    expect(dkim?.ok).toBe(false);
    expect(dkim?.detail).toContain('lm2._domainkey.fivvi.app');
    expect(dkim?.detail).not.toContain('lm1._domainkey.fivvi.app');
  });

  it('fails DKIM when a selector points somewhere that is not Lettermint', async () => {
    const zone = { ...healthy, 'lm1._domainkey.fivvi.app': { cname: ['lm1.example.com'] } };
    const dkim = (await checkSendingDomain('fivvi.app', fakeResolver(zone))).checks.find(
      (check) => check.name === 'DKIM',
    );

    expect(dkim?.ok).toBe(false);
    expect(dkim?.detail).toContain('lm1._domainkey.fivvi.app');
  });

  it('fails DMARC on p=none and says what is needed', async () => {
    const zone = { ...healthy, '_dmarc.fivvi.app': { txt: ['v=DMARC1; p=none'] } };
    const report = await checkSendingDomain('fivvi.app', fakeResolver(zone));
    const dmarc = report.checks.find((check) => check.name === 'DMARC');

    expect(report.ok).toBe(false);
    expect(dmarc?.ok).toBe(false);
    expect(dmarc?.detail).toContain('p=none');
    expect(dmarc?.detail).toMatch(/quarantine/);
  });

  it('fails DMARC when there is no record', async () => {
    const report = await checkSendingDomain(
      'fivvi.app',
      fakeResolver(without(healthy, '_dmarc.fivvi.app')),
    );

    expect(report.checks.find((check) => check.name === 'DMARC')?.ok).toBe(false);
  });

  it('reports every failing record at once', async () => {
    const report = await checkSendingDomain('fivvi.app', fakeResolver({}));

    expect(report.checks.map(({ name, ok }) => [name, ok])).toEqual([
      ['SPF', false],
      ['DKIM', false],
      ['DMARC', false],
    ]);
  });

  it('treats a resolver failure as a failing check, not a crash', async () => {
    const report = await checkSendingDomain(
      'fivvi.app',
      fakeResolver(healthy, { name: '_dmarc.fivvi.app', code: 'ESERVFAIL' }),
    );
    const dmarc = report.checks.find((check) => check.name === 'DMARC');

    expect(dmarc?.ok).toBe(false);
    expect(dmarc?.detail).toContain('ESERVFAIL');
  });
});

describe('F049 AC8: sending-domain check command', () => {
  async function run(zone: Zone, args: string[] = []) {
    const lines: string[] = [];
    const code = await runSendingDomainCheck(args, fakeResolver(zone), (line) => lines.push(line));
    return { code, output: lines.join('\n') };
  }

  it('exits 0 and prints the three records as passing', async () => {
    const { code, output } = await run(healthy);

    expect(code).toBe(0);
    expect(output).toContain('fivvi.app');
    expect(output).toMatch(/PASS\s+SPF/);
    expect(output).toMatch(/PASS\s+DKIM/);
    expect(output).toMatch(/PASS\s+DMARC/);
  });

  it('exits non-zero and names each failing record', async () => {
    const zone = {
      ...without(healthy, 'lm1._domainkey.fivvi.app'),
      '_dmarc.fivvi.app': { txt: ['v=DMARC1; p=none'] },
      'lm-bounces.fivvi.app': { cname: ['bounces.example.com'], txt: [lettermintSpf] },
    };
    const { code, output } = await run(zone);

    expect(code).toBe(1);
    expect(output).toMatch(/FAIL\s+SPF/);
    expect(output).toMatch(/FAIL\s+DKIM/);
    expect(output).toMatch(/FAIL\s+DMARC/);
  });

  it('prints no address from the DMARC report settings', async () => {
    const { output } = await run(healthy);

    expect(output).not.toContain('example.com');
    expect(output).not.toContain('mailto:');
  });

  it('checks another domain when given --domain', async () => {
    const zone = Object.fromEntries(
      Object.entries(healthy).map(([name, entry]) => [
        name.replace('fivvi.app', 'staging.example'),
        entry,
      ]),
    );
    const { code, output } = await run(zone, ['--domain', 'staging.example']);

    expect(code).toBe(0);
    expect(output).toContain('staging.example');
  });

  it('exits 2 on an unknown option', async () => {
    const { code, output } = await run(healthy, ['--nope']);

    expect(code).toBe(2);
    expect(output).toContain('--domain');
  });
});
