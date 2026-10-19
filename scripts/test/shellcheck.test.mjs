import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
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
          'echo "$@" >> "$FAKE_CURL_LOG"\n[ -z "$FAKE_CURL_DELAY" ] || sleep "$FAKE_CURL_DELAY"\n' +
          'cp "$FAKE_DOWNLOAD" "$out"\n',
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
    // Anything but the installed release in the tools directory: temp directories, partial downloads.
    const leftovers = (tools) =>
      existsSync(tools)
        ? readdirSync(tools).filter((name) => name !== `shellcheck-${pinned()}`)
        : [];
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
      assert.deepEqual(leftovers(tools), []);
    });

    it('survives two installs at once (two worktrees running bootstrap.sh): both succeed, one binary, no leftovers', async () => {
      const dir = mkdtempSync(join(work, 'concurrent-'));
      const file = tarball(dir, pinned());
      const tools = join(dir, 'tools');
      const env = {
        ...process.env,
        TOOLS_DIR: tools,
        PATH: `${fakeCurl(dir)}:/usr/bin:/bin`,
        FAKE_DOWNLOAD: file,
        FAKE_CURL_LOG: join(dir, 'curl.log'),
        FAKE_CURL_DELAY: '0.5', // both downloads overlap
      };
      const code = `source "${SCRIPTS}/_lib.sh"; source "${PIN}"
        shellcheck_platform() { echo linux.x86_64; }
        SHELLCHECK_SHA256_linux_x86_64="${sha256(file)}"
        install_shellcheck && [ -x "$SHELLCHECK_HOME/shellcheck" ]`;
      const install = () =>
        new Promise((resolve) => {
          const child = spawn('bash', ['-c', code], { env });
          let stderr = '';
          child.stderr.on('data', (chunk) => {
            stderr += chunk;
          });
          child.on('close', (status) => resolve({ status, stderr }));
        });
      const results = await Promise.all([install(), install()]);
      assert.deepEqual(
        results.map((r) => r.status),
        [0, 0],
        results.map((r) => r.stderr).join(),
      );
      const check = spawnSync(join(tools, `shellcheck-${pinned()}`, 'shellcheck'), ['--version'], {
        encoding: 'utf8',
      });
      assert.match(check.stdout, new RegExp(`version: ${pinned().replaceAll('.', '\\.')}`));
      assert.deepEqual(leftovers(tools), []);
    });

    it('succeeds when another install put the binary in place first', () => {
      const dir = mkdtempSync(join(work, 'raced-'));
      const file = tarball(dir, pinned());
      const tools = join(dir, 'tools');
      const result = run(
        `shellcheck_platform() { echo linux.x86_64; }
         SHELLCHECK_SHA256_linux_x86_64="${sha256(file)}"
         # The other install wins while this one downloads.
         curl() { mkdir -p "$SHELLCHECK_HOME"; cp "${join(dir, 'src', `shellcheck-v${pinned()}`, 'shellcheck')}" "$SHELLCHECK_HOME/shellcheck"; command curl "$@"; }
         install_shellcheck; echo "status=$?"`,
        {
          TOOLS_DIR: tools,
          PATH: `${fakeCurl(dir)}:/usr/bin:/bin`,
          FAKE_DOWNLOAD: file,
          FAKE_CURL_LOG: join(dir, 'curl.log'),
        },
      );
      assert.match(result.stdout, /status=0$/m);
      assert.deepEqual(leftovers(tools), []);
    });

    it('checks with sha256sum when the system has no shasum', () => {
      const dir = mkdtempSync(join(work, 'sha256sum-'));
      const file = tarball(dir, pinned());
      const tools = join(dir, 'tools');
      // A PATH without shasum: the tools install_shellcheck needs, and a sha256sum that records its use.
      const bin = join(dir, 'minimal-bin');
      mkdirSync(bin);
      const which = (tool) =>
        spawnSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).stdout.trim();
      for (const tool of [
        'git',
        'dirname',
        'tr',
        'mkdir',
        'mktemp',
        'tar',
        'gzip',
        'rm',
        'mv',
        'uname',
        'sed',
        'cp',
        'sleep',
      ]) {
        if (which(tool)) symlinkSync(which(tool), join(bin, tool));
      }
      symlinkSync(join(fakeCurl(dir), 'curl'), join(bin, 'curl'));
      const hasher = which('shasum') ? `${which('shasum')} -a 256` : which('sha256sum');
      writeFileSync(
        join(bin, 'sha256sum'),
        `#!/bin/sh\necho "$@" >> "${join(dir, 'sha256sum.log')}"\nexec ${hasher} "$@"\n`,
      );
      chmodSync(join(bin, 'sha256sum'), 0o755);
      const code = `source "${SCRIPTS}/_lib.sh"; source "${PIN}"
        shellcheck_platform() { echo linux.x86_64; }
        SHELLCHECK_SHA256_linux_x86_64="@SHA@"
        install_shellcheck; echo "status=$?"`;
      const attempt = (sha) =>
        spawnSync(which('bash'), ['-c', code.replace('@SHA@', sha)], {
          encoding: 'utf8',
          env: {
            TOOLS_DIR: tools,
            PATH: bin,
            FAKE_DOWNLOAD: file,
            FAKE_CURL_LOG: join(dir, 'curl.log'),
          },
        });
      const mismatch = attempt('0'.repeat(64));
      assert.match(mismatch.stdout, /status=1$/m);
      assert.match(mismatch.stderr, /doesn't match its SHA-256/);
      const good = attempt(sha256(file));
      assert.match(good.stdout, /status=0$/m, good.stderr);
      assert.ok(readFileSync(join(dir, 'sha256sum.log'), 'utf8').includes('-c'));
      assert.ok(existsSync(join(tools, `shellcheck-${pinned()}`, 'shellcheck')));
    });
  });

  describe('shellcheck_platform names the release asset', () => {
    // A uname that answers like the given machine.
    const platformOf = (kernel, machine) => {
      const bin = mkdtempSync(join(work, 'uname-'));
      writeFileSync(
        join(bin, 'uname'),
        `#!/bin/sh\ncase "$1" in -s) echo ${kernel} ;; -m) echo ${machine} ;; esac\n`,
      );
      chmodSync(join(bin, 'uname'), 0o755);
      return run('shellcheck_platform', { PATH: `${bin}:${process.env.PATH}` }).stdout.trim();
    };

    it('maps Darwin arm64 to darwin.aarch64', () => {
      assert.equal(platformOf('Darwin', 'arm64'), 'darwin.aarch64');
    });

    it('maps Darwin x86_64 to darwin.x86_64', () => {
      assert.equal(platformOf('Darwin', 'x86_64'), 'darwin.x86_64');
    });

    it('maps Linux x86_64 and aarch64 as they are', () => {
      assert.equal(platformOf('Linux', 'x86_64'), 'linux.x86_64');
      assert.equal(platformOf('Linux', 'aarch64'), 'linux.aarch64');
    });
  });

  describe('ensure_shellcheck (bootstrap.sh)', () => {
    const tarballOf = (dir) => {
      const src = join(dir, 'src', `shellcheck-v${pinned()}`);
      mkdirSync(src, { recursive: true });
      writeFileSync(join(src, 'shellcheck'), `#!/bin/sh\nprintf 'version: ${pinned()}\\n'\n`);
      chmodSync(join(src, 'shellcheck'), 0o755);
      const file = join(dir, 'release.tar.gz');
      execFileSync('tar', ['-czf', file, '-C', join(dir, 'src'), `shellcheck-v${pinned()}`]);
      return file;
    };
    const ensure = (localVersion) => {
      const dir = mkdtempSync(join(work, 'ensure-'));
      const file = tarballOf(dir);
      const bin = join(dir, 'curl-bin');
      mkdirSync(bin);
      writeFileSync(
        join(bin, 'curl'),
        '#!/bin/sh\nfor a; do [ "$prev" = -o ] && out="$a"; prev="$a"; done\necho "$@" >> "$FAKE_CURL_LOG"\ncp "$FAKE_DOWNLOAD" "$out"\n',
      );
      chmodSync(join(bin, 'curl'), 0o755);
      const local = localVersion ? fakeShellcheck(localVersion) : '/nonexistent';
      const result = run(
        `shellcheck_platform() { echo linux.x86_64; }
         SHELLCHECK_SHA256_linux_x86_64="${createHash('sha256').update(readFileSync(file)).digest('hex')}"
         ensure_shellcheck; echo "status=$?"; echo "version=$(shellcheck_version)"`,
        {
          TOOLS_DIR: join(dir, 'tools'),
          PATH: `${bin}:${local}:/usr/bin:/bin`,
          FAKE_DOWNLOAD: file,
          FAKE_CURL_LOG: join(dir, 'curl.log'),
        },
      );
      const downloads = existsSync(join(dir, 'curl.log'))
        ? readFileSync(join(dir, 'curl.log'), 'utf8').trim().split('\n').length
        : 0;
      return { result, downloads };
    };

    it('downloads nothing when the shellcheck on PATH is the pinned version', () => {
      const { result, downloads } = ensure(pinned());
      assert.match(result.stdout, /status=0$/m);
      assert.equal(downloads, 0);
    });

    it('installs the pinned version, and puts it first on PATH, when the local one differs', () => {
      const { result, downloads } = ensure('0.9.0');
      assert.match(result.stdout, /status=0$/m);
      assert.match(result.stdout, new RegExp(`version=${pinned().replaceAll('.', '\\.')}$`, 'm'));
      assert.equal(downloads, 1);
    });

    it('installs it when there is no shellcheck at all', () => {
      const { result, downloads } = ensure(null);
      assert.match(result.stdout, new RegExp(`version=${pinned().replaceAll('.', '\\.')}$`, 'm'));
      assert.equal(downloads, 1);
    });
  });

  describe('the pin is read from one place', () => {
    const read = (...path) => readFileSync(join(ROOT, ...path), 'utf8');

    // bootstrap.sh installs a whole workspace, so it can't run here; ensure_shellcheck (tested above) is its step.
    it('bootstrap.sh runs ensure_shellcheck, and no longer installs whatever brew has', () => {
      assert.match(read('scripts', 'bootstrap.sh'), /ensure_shellcheck/);
      assert.doesNotMatch(read('scripts', 'bootstrap.sh'), /need shellcheck/);
    });

    // check.sh itself is run against a fake shellcheck in check-summary.test.mjs (E002 #109).

    // The workflow only runs on GitHub: its steps are read, not run.
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
