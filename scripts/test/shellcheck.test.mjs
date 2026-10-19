import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

const SCRIPTS = join(import.meta.dirname, '..');
const ROOT = join(SCRIPTS, '..');
const PIN = join(SCRIPTS, '_shellcheck.sh');

// Runs bash code with the pin sourced (and _lib.sh, which it builds on); `env` replaces entries of the environment.
const run = (code, env = {}) =>
  spawnSync('bash', ['-c', `source "${SCRIPTS}/_lib.sh"; source "${PIN}"; ${code}`], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });

const pinned = () => run('echo "$SHELLCHECK_VERSION"').stdout.trim();

describe('E002 #109 one pinned shellcheck version (scripts/_shellcheck.sh)', () => {
  let work;
  before(() => {
    work = mkdtempSync(join(tmpdir(), 'shellcheck-pin-'));
  });
  after(() => rmSync(work, { recursive: true, force: true }));

  // A stand-in for shellcheck that reports the given version, in the format of the real one.
  const fakeShellcheck = (version) => {
    const bin = mkdtempSync(join(work, 'bin-'));
    writeFileSync(
      join(bin, 'shellcheck'),
      `#!/bin/sh\nprintf 'ShellCheck - shell script analysis tool\\nversion: ${version}\\nlicense: GPL\\n'\n`,
    );
    chmodSync(join(bin, 'shellcheck'), 0o755);
    return bin;
  };

  it('pins a release version, with a SHA-256 for every platform the scripts and CI run on', () => {
    assert.match(pinned(), /^\d+\.\d+\.\d+$/);
    for (const platform of ['darwin_aarch64', 'darwin_x86_64', 'linux_x86_64', 'linux_aarch64']) {
      assert.match(
        run(`echo "$SHELLCHECK_SHA256_${platform}"`).stdout.trim(),
        /^[0-9a-f]{64}$/,
        platform,
      );
    }
  });

  describe('warn_shellcheck_version (called by check.sh)', () => {
    it('warns about a different local version, names the fix, and does not fail', () => {
      const bin = fakeShellcheck('0.9.0');
      const result = run('warn_shellcheck_version; echo "status=$?"', {
        PATH: `${bin}:${process.env.PATH}`,
      });
      assert.match(result.stdout, /status=0$/m);
      assert.match(result.stdout, /shellcheck 0\.9\.0/);
      assert.match(result.stdout, new RegExp(`${pinned().replaceAll('.', '\\.')}`));
      assert.match(result.stdout, /scripts\/bootstrap\.sh/);
    });

    it('is silent when the local version is the pinned one', () => {
      const bin = fakeShellcheck(pinned());
      const result = run('warn_shellcheck_version; echo "status=$?"', {
        PATH: `${bin}:${process.env.PATH}`,
      });
      assert.equal(result.stdout.trim(), 'status=0');
    });
  });

  describe('install_shellcheck (bootstrap.sh locally, ci.yml on the runner)', () => {
    // A release tarball the way koalaman/shellcheck ships it: shellcheck-v<version>/shellcheck.
    const tarball = (dir, version) => {
      const src = join(dir, 'src', `shellcheck-v${version}`);
      mkdirSync(src, { recursive: true });
      writeFileSync(join(src, 'shellcheck'), `#!/bin/sh\nprintf 'version: ${version}\\n'\n`);
      chmodSync(join(src, 'shellcheck'), 0o755);
      const file = join(dir, 'release.tar.gz');
      execFileSync('tar', ['-czf', file, '-C', join(dir, 'src'), `shellcheck-v${version}`]);
      return file;
    };

    // A stand-in for curl that logs the URL and "downloads" $FAKE_DOWNLOAD to the -o path.
    const fakeCurl = (dir) => {
      const bin = join(dir, 'curl-bin');
      mkdirSync(bin);
      writeFileSync(
        join(bin, 'curl'),
        '#!/bin/sh\nfor a; do [ "$prev" = -o ] && out="$a"; prev="$a"; done\n' +
          'echo "$@" >> "$FAKE_CURL_LOG"\ncp "$FAKE_DOWNLOAD" "$out"\n',
      );
      chmodSync(join(bin, 'curl'), 0o755);
      return bin;
    };

    const install = (download, sha) => {
      const dir = mkdtempSync(join(work, 'install-'));
      const file = download(dir);
      const tools = join(dir, 'tools');
      const result = run(
        `shellcheck_platform() { echo linux.x86_64; }
         SHELLCHECK_SHA256_linux_x86_64="${sha(file)}"
         install_shellcheck; echo "status=$?"; use_pinned_shellcheck; echo "version=$(shellcheck_version)"`,
        {
          TOOLS_DIR: tools,
          PATH: `${fakeCurl(dir)}:/usr/bin:/bin`,
          FAKE_DOWNLOAD: file,
          FAKE_CURL_LOG: join(dir, 'curl.log'),
        },
      );
      const log = existsSync(join(dir, 'curl.log'))
        ? readFileSync(join(dir, 'curl.log'), 'utf8')
        : '';
      return { result, tools, log };
    };
    const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

    it('downloads the pinned release from koalaman/shellcheck, verifies its SHA-256 and puts it on PATH', () => {
      const { result, log } = install((dir) => tarball(dir, pinned()), sha256);
      assert.match(result.stdout, /status=0$/m);
      assert.match(result.stdout, new RegExp(`version=${pinned().replaceAll('.', '\\.')}$`, 'm'));
      assert.ok(
        log.includes(
          `https://github.com/koalaman/shellcheck/releases/download/v${pinned()}/shellcheck-v${pinned()}.linux.x86_64.tar.gz`,
        ),
        log,
      );
    });

    it('does not download again when the pinned binary is already there', () => {
      const dir = mkdtempSync(join(work, 'again-'));
      const file = tarball(dir, pinned());
      const tools = join(dir, 'tools');
      const env = {
        TOOLS_DIR: tools,
        PATH: `${fakeCurl(dir)}:/usr/bin:/bin`,
        FAKE_DOWNLOAD: file,
        FAKE_CURL_LOG: join(dir, 'curl.log'),
      };
      const code = `shellcheck_platform() { echo linux.x86_64; }
        SHELLCHECK_SHA256_linux_x86_64="${sha256(file)}"; install_shellcheck && install_shellcheck`;
      assert.equal(run(code, env).status, 0);
      assert.equal(readFileSync(join(dir, 'curl.log'), 'utf8').trim().split('\n').length, 1);
    });

    it('refuses a download that does not match its SHA-256 and leaves nothing behind', () => {
      const { result, tools } = install(
        (dir) => tarball(dir, pinned()),
        () => '0'.repeat(64),
      );
      assert.match(result.stdout, /status=1$/m);
      assert.match(result.stderr, /doesn't match its SHA-256/);
      assert.match(result.stdout, /version=$/m);
      assert.ok(!existsSync(join(tools, `shellcheck-${pinned()}`, 'shellcheck')));
    });
  });

  describe('the pin is read from one place', () => {
    const read = (...path) => readFileSync(join(ROOT, ...path), 'utf8');

    it('bootstrap.sh installs the pinned version', () => {
      assert.match(read('scripts', 'bootstrap.sh'), /install_shellcheck/);
      assert.doesNotMatch(read('scripts', 'bootstrap.sh'), /need shellcheck/);
    });

    it('check.sh puts the pinned binary first on PATH and warns about a different version', () => {
      const check = read('scripts', 'check.sh');
      assert.match(check, /use_pinned_shellcheck/);
      assert.match(check, /warn_shellcheck_version/);
    });

    it('ci.yml installs it from the same script, and fails when shellcheck --version differs', () => {
      const ci = read('.github', 'workflows', 'ci.yml');
      assert.match(ci, /source scripts\/_shellcheck\.sh/);
      assert.match(ci, /install_shellcheck/);
      assert.match(ci, /shellcheck_version/);
      assert.match(ci, /hashFiles\('scripts\/_shellcheck\.sh'\)/);
      assert.doesNotMatch(
        ci,
        new RegExp(pinned().replaceAll('.', '\\.')),
        'no second copy of the version',
      );
    });
  });
});
