// A stand-in for the gh CLI, so the scripts' I/O can be tested without network. Each call is matched against rules
// ({match: regex on the space-joined arguments, out: string or JSON, status}); the first match answers. A rule with
// `outs` (a list) answers its first call with the first entry, the second with the second, and then repeats the last:
// for a state that changes during a command (a PR that is removed from the merge queue, then queued). `--jq` is
// applied with jq like gh does. Every call is logged, with the content of an `--input` file and, for `secret set`, the
// value piped to its stdin.
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GH = `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const args = process.argv.slice(2);
const line = args.join(' ');
const at = (flag) => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
const input = at('--input');
const body = input === undefined ? undefined : readFileSync(input === '-' ? 0 : input, 'utf8');
const stdin = args[0] === 'secret' && args[1] === 'set' && input === undefined ? readFileSync(0, 'utf8') : undefined;
const rules = JSON.parse(readFileSync(process.env.FAKE_GH_RULES, 'utf8'));
const answeredBy = (text) => rules.findIndex((r) => new RegExp(r.match).test(text));
const earlier = readFileSync(process.env.FAKE_GH_LOG, 'utf8').split('\\n').filter(Boolean).map((entry) => answeredBy(JSON.parse(entry).args.join(' ')));
appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify({ args, input: body, stdin }) + '\\n');
const index = answeredBy(line);
if (index < 0) { process.stderr.write('fake gh: no rule for: ' + line + '\\n'); process.exit(1); }
const rule = rules[index];
const answer = rule.outs === undefined ? rule.out : rule.outs[Math.min(earlier.filter((i) => i === index).length, rule.outs.length - 1)];
let out = answer === undefined ? '' : typeof answer === 'string' ? answer : JSON.stringify(answer);
const jq = at('--jq') ?? at('-q');
if (jq !== undefined) out = execFileSync('jq', ['-r', jq], { input: out, encoding: 'utf8' });
else if (out !== '' && !out.endsWith('\\n')) out += '\\n';
process.stdout.write(out);
process.exit(rule.status ?? 0);
`;

export function fakeGh() {
  const dir = mkdtempSync(join(tmpdir(), 'fake-gh-'));
  writeFileSync(join(dir, 'gh'), GH);
  chmodSync(join(dir, 'gh'), 0o755);
  const rulesFile = join(dir, 'rules.json');
  const logFile = join(dir, 'calls.log');
  return {
    env: (rules) => {
      writeFileSync(rulesFile, JSON.stringify(rules));
      writeFileSync(logFile, '');
      return {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        FAKE_GH_RULES: rulesFile,
        FAKE_GH_LOG: logFile,
      };
    },
    calls: () =>
      readFileSync(logFile, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((entry) => JSON.parse(entry)),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
