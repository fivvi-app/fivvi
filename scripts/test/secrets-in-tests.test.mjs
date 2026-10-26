// E002 #228: tests hold only obviously fake secrets. The guard (scripts/secrets-in-tests.mjs) finds random-looking
// tokens in test files, alone or assembled from parts. The random values here are generated at run time from a fixed
// seed, so this file passes its own guard.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import {
  check,
  entropy,
  isTestFile,
  literals,
  looksRandom,
  parseAllowlist,
  run,
  scan,
} from '../secrets-in-tests.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const HEX = '0123456789abcdef';

// A seeded pseudo-random string (mulberry32), the same on every run.
const random = (length, alphabet, seed) => {
  let state = seed;
  let out = '';
  for (let i = 0; i < length; i++) {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    out += alphabet[((((t ^ (t >>> 14)) >>> 0) / 4294967296) * alphabet.length) | 0];
  }
  return out;
};

const linkToken = random(43, BASE64URL.replace(/[-_]/g, ''), 1);
const hexKey = random(32, HEX, 2);
const sha256 = random(64, HEX, 3);
const urlSafeToken =
  random(21, BASE64URL.replace(/[-_]/g, ''), 4) +
  '-' +
  random(21, BASE64URL.replace(/[-_]/g, ''), 5);
const chunks = [10, 11, 12, 13].map((seed) => random(8, BASE64URL.replace(/[-_]/g, ''), seed));

const lines = (path, text) => scan(path, text).map((finding) => finding.line);

describe('which files are test files (#228)', () => {
  it('takes the test paths of the ticket', () => {
    for (const path of [
      'packages/observability/src/scrub.test.ts',
      'apps/web/e2e/sign-in.spec.ts',
      'scripts/test/emails.test.mjs',
      'packages/api/test/sign-in.integration.test.ts',
      'apps/cron/test/main.test.ts',
      'packages/testing/src/database.ts',
      'apps/ios/FivviProTests/ObservabilitySignInTests.swift',
      'apps/ios/FivviProUITests/Support/AppLaunch.swift',
      'apps/android/app/src/test/kotlin/app/fivvi/pro/ObservabilityTest.kt',
      'apps/android/app/src/androidTest/kotlin/app/fivvi/pro/HelloTest.kt',
      'apps/android/app/src/testShared/kotlin/app/fivvi/pro/Fixtures.kt',
      'e2e/maestro/hello.yaml',
    ]) {
      assert.ok(isTestFile(path), path);
    }
  });

  it('leaves the rest, lockfiles and other file types out', () => {
    for (const path of [
      'packages/observability/src/scrub.ts',
      'apps/android/app/src/main/kotlin/app/fivvi/pro/Main.kt',
      'apps/ios/FivviPro/Hello.swift',
      'pnpm-lock.yaml',
      'packages/testing/pnpm-lock.yaml',
      'packages/testing/README.md',
      'apps/web/e2e/screenshot.png',
    ]) {
      assert.ok(!isTestFile(path), path);
    }
  });
});

describe('the token test (#228)', () => {
  it('measures Shannon entropy in bits per character', () => {
    assert.equal(entropy('aaaa'), 0);
    assert.equal(entropy('abab'), 1);
    assert.equal(entropy('abcdefgh'), 3);
  });

  it('the generated fixtures of this file are random-looking enough to mean something', () => {
    assert.ok(entropy(linkToken) > 4.5, `${entropy(linkToken)}`);
    assert.ok(entropy(hexKey) > 3.3, `${entropy(hexKey)}`);
  });

  it('flags a random 43-character mixed-case token', () => {
    assert.equal(linkToken.length, 43);
    assert.ok(looksRandom(linkToken));
  });

  it('flags a random 32-character hex key and a 64-character hash', () => {
    assert.ok(looksRandom(hexKey));
    assert.ok(looksRandom(sha256));
  });

  it('flags a URL-safe token with a hyphen in the middle and a standard base64 token', () => {
    assert.ok(looksRandom(urlSafeToken));
    assert.ok(looksRandom(random(40, BASE64.replace('/', ''), 6)));
  });

  it('passes the obviously fake shapes', () => {
    for (const fake of [
      'fake-link-token-for-tests',
      'fake-bearer-token-for-tests',
      'fake-api-key-for-tests-only',
      '1'.repeat(40),
      '0'.repeat(32),
      '0123456789abcdef0123456789abcdef',
      'a'.repeat(30),
    ]) {
      assert.ok(!looksRandom(fake), fake);
    }
  });

  it('passes identifiers, names and codes that are not secrets', () => {
    for (const name of [
      'NEXT_PUBLIC_POSTHOG_KEY',
      'SHELLCHECK_SHA256_linux_x86_64',
      'feature-57-hold-a-spot',
      'ADR-016-agent-merges',
      'test_E008_AC6_usesTokenColoursInLightAndDark',
      'UITestPerAppLanguage',
      'UICTContentSizeCategoryAccessibilityXXXL',
      '3f2e1d0c-9b8a-4765-8432-10fedcba9876',
      '20261026123456789012',
    ]) {
      assert.ok(!looksRandom(name), name);
    }
  });

  it('passes what is shorter than 20 characters, however random', () => {
    assert.ok(!looksRandom(random(19, BASE64URL, 7)));
  });
});

describe('what a literal may hold (#228)', () => {
  const clean = (text) => assert.deepEqual(scan('a.test.ts', text), [], text);

  it('passes an email address, URLs, i18n keys, ISO dates and long readable sentences', () => {
    clean("const owner = 'owner@example.com';");
    clean(
      "const url = 'https://app.example.com/clients/3f2e1d0c-9b8a-4765-8432-10fedcba9876?email=owner%40example.com#notes';",
    );
    clean(
      "const url = 'https://app.example.com/api/v1/clients/some-readable-client-name/appointments';",
    );
    clean("t('auth.signIn.linkSent.description.withCode');");
    clean("const at = '2026-10-26T12:00:00.000Z';");
    clean("const at = '2026-10-26T12:00:00.000+02:00';");
    clean(
      "const sentence = 'The trainer opens the schedule and sees every class of the coming week, sorted by time.';",
    );
    clean(
      'const sentence = `Could not invite ${EMAIL} to the workspace because the address was refused by the server`;',
    );
    clean("const token = 'fake-link-token-for-tests';");
  });

  it('flags a random token in a single quoted, double quoted or template literal', () => {
    assert.deepEqual(lines('a.test.ts', `const a = 1;\nconst token = '${linkToken}';`), [2]);
    assert.deepEqual(lines('a.test.ts', `const token = "${linkToken}";`), [1]);
    assert.deepEqual(lines('a.test.ts', `const token = \`${linkToken}\`;`), [1]);
  });

  it('flags a token inside a longer text, a URL or a header', () => {
    assert.deepEqual(
      lines(
        'a.test.ts',
        `const url = 'https://app.example.com/login?token=${linkToken}&next=%2F';`,
      ),
      [1],
    );
    assert.deepEqual(
      lines('a.test.ts', `const header = 'Authorization: Bearer ${linkToken}';`),
      [1],
    );
    assert.deepEqual(lines('a.test.ts', `const key = 'sk_live_${hexKey}';`), [1]);
  });

  it('names the line of the token inside a multi-line template literal', () => {
    assert.deepEqual(
      lines('a.test.ts', `const body = \`first line\nsecond line\ntoken ${linkToken}\n\`;`),
      [3],
    );
  });

  it('reads a token behind an interpolation as text around it', () => {
    clean('const text = `${prefix}-fake-link-token-for-tests-${suffix}`;');
    assert.deepEqual(lines('a.test.ts', `const text = \`\${prefix}${linkToken}\`;`), [1]);
  });

  it('ignores comments, so an apostrophe in one does not turn code into a string', () => {
    clean(`// don't use ${linkToken} here\nconst a = 'short';\n/* it's ${hexKey} */`);
  });

  it('finds Swift and Kotlin literals, with their interpolations', () => {
    assert.deepEqual(lines('Tests.swift', `let token = "${linkToken}"`), [1]);
    assert.deepEqual(lines('Test.kt', `val token = "${hexKey}"`), [1]);
    assert.deepEqual(
      scan('Tests.swift', 'let text = "Sign-in failed for \\(address) and \\(other)"'),
      [],
    );
    assert.deepEqual(
      scan('Test.kt', 'val text = "Sign-in failed for ${address} and $other for good"'),
      [],
    );
    assert.deepEqual(lines('Test.kt', `val text = """\nline\n${linkToken}\n"""`), [3]);
  });

  it('finds YAML values and leaves YAML comments alone', () => {
    assert.deepEqual(lines('flow.yaml', `# don't ${linkToken}\ntoken: "${linkToken}"`), [2]);
  });

  it('lists a file’s literals with their start line', () => {
    assert.deepEqual(
      literals("const a = 'one';\nconst b = `two\nthree`;\n").map(({ value, line }) => [
        value,
        line,
      ]),
      [
        ['one', 1],
        ['two\nthree', 2],
      ],
    );
  });
});

describe('a value assembled from parts (#228)', () => {
  const [one, two, three, four] = chunks;

  it('flags an array of chunks joined, with an empty or a hyphen separator', () => {
    assert.deepEqual(
      lines('a.test.ts', `const token = ['${one}', '${two}', '${three}', '${four}'].join('');`),
      [1],
    );
    assert.deepEqual(
      lines('a.test.ts', `const token = ['${one}', '${two}', '${three}', '${four}'].join('-');`),
      [1],
    );
  });

  it('flags a join over several lines, at the line it starts on', () => {
    const text = `const a = 1;\nconst token = [\n  '${one}',\n  '${two}',\n  '${three}',\n  '${four}',\n].join('');`;
    assert.deepEqual(lines('a.test.ts', text), [3]);
  });

  it('flags chunks added up with +', () => {
    assert.deepEqual(
      lines('a.test.ts', `const token = '${one}' + '${two}' + '${three}' + '${four}';`),
      [1],
    );
    assert.deepEqual(
      lines('a.test.ts', `const token =\n  '${one}' +\n  '${two}' +\n  '${three}' +\n  '${four}';`),
      [2],
    );
  });

  it('flags Swift and Kotlin joins', () => {
    assert.deepEqual(
      lines('Tests.swift', `let token = ["${one}", "${two}", "${three}", "${four}"].joined()`),
      [1],
    );
    assert.deepEqual(
      lines(
        'Test.kt',
        `val token = listOf("${one}", "${two}", "${three}", "${four}").joinToString("")`,
      ),
      [1],
    );
    assert.deepEqual(
      lines('Test.kt', `val token = "${one}" + "${two}" + "${three}" + "${four}"`),
      [1],
    );
  });

  it('passes readable parts: a sentence in pieces, a list of words, a path built from names', () => {
    const clean = (text) => assert.deepEqual(scan('a.test.ts', text), [], text);
    clean("const text = 'The trainer opens the schedule ' + 'and sees every class of the week.';");
    clean("const script = ['#!/bin/sh', 'echo fake-link-token-for-tests', 'exit 0'].join('\\n');");
    clean("const names = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'].join(',');");
    clean("const token = 'fake-link-' + 'token-for-' + 'tests';");
  });

  it('does not join literals that are not all added or listed together', () => {
    assert.deepEqual(
      scan('a.test.ts', `const token = '${one}' + id + '${two}' + id + '${three}';`),
      [],
    );
    assert.deepEqual(scan('a.test.ts', `call('${one}', '${two}', '${three}', '${four}');`), []);
  });
});

describe('the allowlist (#228)', () => {
  it('needs a reason on every entry', () => {
    const { entries, problems } = parseAllowlist(
      [
        '# comment',
        '',
        'a/*.test.ts: some-value-here  # a published test vector',
        'b.test.ts: no-reason-here',
      ].join('\n'),
    );
    assert.deepEqual(entries, [{ path: 'a/*.test.ts', value: 'some-value-here' }]);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /secrets-allowlist\.txt:4: .*reason/);
  });

  it('lets an allowlisted value stay in the files it names, and nothing else', () => {
    const text = `const vector = '${sha256}';`;
    assert.deepEqual(lines('a/vector.test.ts', text), [1]);
    assert.deepEqual(check('a/vector.test.ts', text, [{ path: 'a/*.test.ts', value: sha256 }]), []);
    assert.deepEqual(lines('b/vector.test.ts', text), [1]);
    assert.deepEqual(
      check('b/vector.test.ts', text, [{ path: 'a/*.test.ts', value: sha256 }]).map(
        (finding) => finding.line,
      ),
      [1],
    );
    assert.deepEqual(
      check('a/vector.test.ts', `const t = '${linkToken}';\n${text}`, [
        { path: 'a/*.test.ts', value: sha256 },
      ]).map((finding) => finding.line),
      [1],
    );
  });
});

describe('scripts/secrets-in-tests.mjs on a checkout (#228)', () => {
  const dirs = [];
  after(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  const makeRepo = (files) => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'secrets-')));
    dirs.push(dir);
    execFileSync('git', ['init', '--quiet', dir]);
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    return dir;
  };
  const guard = (dir) =>
    spawnSync('node', [join(ROOT, 'scripts/secrets-in-tests.mjs'), dir], { encoding: 'utf8' });

  it('passes a checkout whose tests hold obviously fake values', () => {
    const dir = makeRepo({ 'src/a.test.ts': "const token = 'fake-link-token-for-tests';\n" });
    const result = guard(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
  });

  it('fails with file:line and the way to fix it, and never prints the value', () => {
    const dir = makeRepo({
      'src/a.test.ts': `const ok = 1;\nconst token = '${linkToken}';\n`,
      'src/b.test.ts': `const key = ['${chunks[0]}', '${chunks[1]}', '${chunks[2]}', '${chunks[3]}'].join('');\n`,
    });
    const result = guard(dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^src\/a\.test\.ts:2: .*random secret/m);
    assert.match(result.stderr, /^src\/b\.test\.ts:1: .*assembled from parts/m);
    assert.match(result.stderr, /obviously fake/);
    assert.match(result.stderr, /fake-link-token-for-tests/);
    assert.ok(!result.stderr.includes(linkToken));
    for (const chunk of chunks) assert.ok(!result.stderr.includes(chunk));
  });

  it('scans only test files, and files git knows', () => {
    const dir = makeRepo({
      'src/a.ts': `const token = '${linkToken}';\n`,
      'src/pnpm-lock.yaml': `integrity: '${linkToken}'\n`,
      'src/a.test.ts': "const token = 'fake-link-token-for-tests';\n",
    });
    assert.equal(guard(dir).status, 0);
  });

  it('fails on an allowlist entry without a reason', () => {
    const dir = makeRepo({ 'scripts/secrets-allowlist.txt': 'a.test.ts: some-value\n' });
    const lines = run(dir, 'a.test.ts: some-value\n');
    assert.match(lines[0], /reason/);
  });

  it('is clean on this repository, and scripts/check.sh runs it', () => {
    assert.deepEqual(run(ROOT), []);
    assert.match(
      readFileSync(join(ROOT, 'scripts/check.sh'), 'utf8'),
      /check "secrets in tests" node .*secrets-in-tests\.mjs/,
    );
  });
});
