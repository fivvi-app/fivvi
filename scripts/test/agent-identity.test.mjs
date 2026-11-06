// scripts/agent-identity.mjs: Claude Code's own GitHub identity through a GitHub App. Everything runs against a local
// stand-in for the GitHub API, a stub `security` on PATH and a temporary HOME; no real key, token or settings file.
// The RSA key is generated per run, and the tokens are obviously fake.
import assert from 'node:assert/strict';
import { createHash, createVerify, generateKeyPairSync } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, afterEach, beforeEach, describe, it } from 'node:test';

const SCRIPT = join(import.meta.dirname, '..', 'agent-identity.mjs');
const FAKE_TOKEN = 'not-a-real-token-1';
const OTHER_FAKE_TOKEN = 'not-a-real-token-2';
const BOT_ID = 4242;
const SLUG = 'example-bot-app';
const SERVICE = 'example-service';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });

const inMinutes = (minutes) => new Date(Date.now() + minutes * 60_000).toISOString();

// Asynchronous on purpose: the stand-in API runs in this process, which a synchronous spawn would block.
const exec = (command, args, { env = {}, cwd, input = '' } = {}) =>
  new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(input);
  });
// Leaks this suite must never have: `setup` run from the real script writes the real main checkout's settings (it
// finds the checkout from its own location, whatever the cwd), and a run with the real HOME or the real PATH reads the
// owner's App config, Keychain item and token cache. So `run` refuses both, before it starts anything.
const run = (args, { script = SCRIPT, ...options } = {}) => {
  if (args[0] === 'setup' && script === SCRIPT && !args.includes('--settings')) {
    throw new Error(
      'refusing to run the real script `setup` without --settings: it would write the real main checkout',
    );
  }
  const { HOME, PATH } = options.env ?? {};
  if (
    !HOME ||
    !realpathSync(HOME).startsWith(realpathSync(tmpdir())) ||
    !PATH?.startsWith(join(HOME, 'bin'))
  ) {
    throw new Error(
      'refusing to run the script outside a temporary HOME with the stub `security` first on PATH',
    );
  }
  return exec(process.execPath, [script, ...args], options);
};

// A read-only watch on a file: assertUnchanged() fails when it was created, changed or removed since the watch began.
const fingerprint = (path) =>
  existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : 'missing';
const watch = (path) => {
  const before = fingerprint(path);
  return {
    assertUnchanged: () =>
      assert.equal(fingerprint(path), before, `${path} changed while the tests ran`),
  };
};
// The real main checkout of the repository this suite runs in, found from the real script (read-only).
const REAL_MAIN_CHECKOUT = dirname(
  resolve(
    dirname(SCRIPT),
    execFileSync('git', ['-C', dirname(SCRIPT), 'rev-parse', '--git-common-dir'], {
      encoding: 'utf8',
    }).trim(),
  ),
);
const REAL_SETTINGS = join(REAL_MAIN_CHECKOUT, '.claude', 'settings.local.json');
const realSettings = watch(REAL_SETTINGS);
after(() => realSettings.assertUnchanged());

describe('the suite cannot touch the real machine', () => {
  let dir;
  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'agent-identity-guard-')));
    mkdirSync(join(dir, 'bin'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const safeEnv = () => ({ HOME: dir, PATH: `${join(dir, 'bin')}:${process.env.PATH}` });

  it('the watch on a file fails when it changes, is created or is removed, and passes when it does not', () => {
    const file = join(dir, 'settings.local.json');
    watch(file).assertUnchanged();
    writeFileSync(file, '{}');
    const present = watch(file);
    present.assertUnchanged();
    writeFileSync(file, '{"a":1}');
    assert.throws(() => present.assertUnchanged(), /changed while the tests ran/);
    const absent = watch(join(dir, 'other.json'));
    writeFileSync(join(dir, 'other.json'), '{}');
    assert.throws(() => absent.assertUnchanged(), /changed while the tests ran/);
    const doomed = watch(file);
    rmSync(file);
    assert.throws(() => doomed.assertUnchanged(), /changed while the tests ran/);
  });

  it('finds the real main checkout from the real script, and the watch on its settings is read-only', () => {
    assert.ok(existsSync(join(REAL_MAIN_CHECKOUT, '.git')), REAL_MAIN_CHECKOUT);
    assert.notEqual(REAL_MAIN_CHECKOUT, dir);
  });

  it('run refuses `setup` from the real script without --settings, whatever else it is given', () => {
    assert.throws(
      () => run(['setup', '--assignee', 'example-owner'], { env: safeEnv() }),
      /without --settings/,
    );
    assert.throws(() => run(['setup', '--remove'], { env: safeEnv() }), /without --settings/);
    assert.throws(
      () => run(['setup', '--assignee', 'x'], { env: safeEnv(), cwd: dir }),
      /without --settings/,
    );
  });

  it('run refuses an environment with the real HOME, no HOME, or no stub `security` first on PATH', () => {
    assert.throws(
      () => run(['token'], { env: { ...safeEnv(), HOME: process.env.HOME } }),
      /temporary HOME/,
    );
    assert.throws(() => run(['token'], { env: { PATH: process.env.PATH } }), /temporary HOME/);
    assert.throws(() => run(['token'], {}), /temporary HOME/);
    assert.throws(
      () => run(['token'], { env: { HOME: dir, PATH: process.env.PATH } }),
      /temporary HOME/,
    );
  });
});

// A stand-in for api.github.com: records the requests, answers from `respond`.
const startApi = async (respond) => {
  const requests = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const request = { method: req.method, url: req.url, headers: req.headers, body };
      requests.push(request);
      const { status = 200, json } = respond(request);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    requests,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const mintOk = (request) =>
  request.method === 'POST'
    ? { status: 201, json: { token: FAKE_TOKEN, expires_at: inMinutes(60) } }
    : { json: { id: BOT_ID, login: `${SLUG}[bot]` } };

describe('scripts/agent-identity.mjs', () => {
  let home;
  let api;
  let env;
  const configDir = () => join(home, '.config', 'fivvi-claude');
  const writeApp = (extra = {}) => {
    mkdirSync(configDir(), { recursive: true });
    writeFileSync(
      join(configDir(), 'app.json'),
      JSON.stringify({
        app_id: 1234567,
        slug: SLUG,
        owner: 'example-owner',
        keychain_service: SERVICE,
        installation_id: 987654,
        ...extra,
      }),
    );
  };
  const startWith = async (respond) => {
    api = await startApi(respond);
    env = { ...env, FIVVI_GITHUB_API: api.url };
  };

  beforeEach(() => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'agent-identity-')));
    // A `security` that answers only for the right account and service, with the key in base64 like the real item.
    mkdirSync(join(home, 'bin'));
    writeFileSync(join(home, 'key.b64'), Buffer.from(PEM).toString('base64'));
    writeFileSync(
      join(home, 'bin', 'security'),
      `#!/bin/sh\n[ "$*" = "find-generic-password -a fivvi-claude -s ${SERVICE} -w" ] || exit 44\ncat "${join(home, 'key.b64')}"\n`,
    );
    chmodSync(join(home, 'bin', 'security'), 0o755);
    env = {
      HOME: home,
      PATH: `${join(home, 'bin')}:${process.env.PATH}`,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: join(home, '.gitconfig'),
    };
    api = undefined;
  });
  afterEach(async () => {
    await api?.close();
    rmSync(home, { recursive: true, force: true });
  });

  describe('token', () => {
    it('prints the installation token and nothing else, signed as the App, narrowed to the repository', async () => {
      writeApp();
      await startWith(mintOk);
      const result = await run(['token'], { env });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, `${FAKE_TOKEN}\n`);
      assert.equal(result.stderr, '');

      assert.equal(api.requests.length, 1);
      const [request] = api.requests;
      assert.equal(request.method, 'POST');
      assert.equal(request.url, '/app/installations/987654/access_tokens');
      assert.deepEqual(JSON.parse(request.body), { repositories: ['fivvi'] });
      const jwt = request.headers.authorization.replace(/^Bearer /, '');
      const [head, body, signature] = jwt.split('.');
      assert.deepEqual(JSON.parse(Buffer.from(head, 'base64url')), { alg: 'RS256', typ: 'JWT' });
      assert.ok(
        createVerify('RSA-SHA256')
          .update(`${head}.${body}`)
          .verify(publicKey, Buffer.from(signature, 'base64url')),
        'the signature verifies with the public key',
      );
      const claims = JSON.parse(Buffer.from(body, 'base64url'));
      const now = Math.floor(Date.now() / 1000);
      assert.equal(claims.iss, '1234567');
      assert.ok(Math.abs(claims.iat - (now - 60)) < 30);
      assert.ok(Math.abs(claims.exp - (now + 540)) < 30);
    });

    it('takes the repository name from app.json when it has one', async () => {
      writeApp({ repo: 'other-repo' });
      await startWith(mintOk);
      await run(['token'], { env });
      assert.deepEqual(JSON.parse(api.requests[0].body), { repositories: ['other-repo'] });
    });

    it('caches the token in a file only the user can read and reuses it while more than 10 minutes remain', async () => {
      writeApp();
      await startWith(mintOk);
      await run(['token'], { env });
      const cache = join(configDir(), 'token.json');
      assert.equal(statSync(cache).mode & 0o777, 0o600);
      assert.equal(JSON.parse(readFileSync(cache, 'utf8')).token, FAKE_TOKEN);
      assert.deepEqual(
        strayFiles(configDir()),
        [],
        'the atomic write leaves no temporary file behind',
      );

      const second = await run(['token'], { env });
      assert.equal(second.stdout, `${FAKE_TOKEN}\n`);
      assert.equal(api.requests.length, 1, 'no second request');
    });

    it('asks for a new token when 10 minutes or less remain', async () => {
      writeApp();
      await startWith(mintOk);
      writeFileSync(
        join(configDir(), 'token.json'),
        JSON.stringify({
          token: OTHER_FAKE_TOKEN,
          expires_at: inMinutes(9),
          installation_id: '987654',
          repository: 'fivvi',
        }),
      );
      const result = await run(['token'], { env });
      assert.equal(result.stdout, `${FAKE_TOKEN}\n`);
      assert.equal(api.requests.length, 1);
    });

    it('does not reuse a cached token minted for another installation or repository', async () => {
      writeApp();
      await startWith(mintOk);
      writeFileSync(
        join(configDir(), 'token.json'),
        JSON.stringify({
          token: OTHER_FAKE_TOKEN,
          expires_at: inMinutes(50),
          installation_id: '1',
          repository: 'fivvi',
        }),
      );
      assert.equal((await run(['token'], { env })).stdout, `${FAKE_TOKEN}\n`);
    });

    const failures = {
      'there is no app.json': () => {},
      'the Keychain has no key': async () => {
        writeApp({ keychain_service: 'unknown-service' });
        await startWith(mintOk);
      },
      'the Keychain holds something that is not a key': async () => {
        writeApp();
        writeFileSync(join(home, 'key.b64'), Buffer.from('not a key').toString('base64'));
        await startWith(mintOk);
      },
      'GitHub refuses (HTTP 401)': async () => {
        writeApp();
        await startWith(() => ({
          status: 401,
          json: { message: `Bad credentials ${PEM.split('\n')[1]}` },
        }));
      },
      'GitHub answers without a token': async () => {
        writeApp();
        await startWith(() => ({ status: 201, json: {} }));
      },
      'GitHub cannot be reached': () => {
        writeApp();
        env = { ...env, FIVVI_GITHUB_API: 'http://127.0.0.1:1' };
      },
    };
    for (const [name, arrange] of Object.entries(failures)) {
      it(`fails with an empty stdout and one line on stderr, with no key or token in it, when ${name}`, async () => {
        await arrange();
        const result = await run(['token'], { env });
        assert.notEqual(result.status, 0);
        assert.equal(result.stdout, '');
        assert.equal(result.stderr.trim().split('\n').length, 1, result.stderr);
        assert.match(result.stderr, /^agent-identity: /);
        for (const secret of [
          PEM.split('\n')[1],
          Buffer.from(PEM).toString('base64').slice(0, 40),
          FAKE_TOKEN,
        ]) {
          assert.ok(!result.stderr.includes(secret), 'no key or token material on stderr');
        }
      });
    }

    it('does not cache a failure', async () => {
      writeApp();
      await startWith(() => ({ status: 500, json: { message: 'boom' } }));
      await run(['token'], { env });
      assert.equal(existsSync(join(configDir(), 'token.json')), false);
    });
  });

  describe('git-credential', () => {
    const ask = (operation, fields) =>
      run(['git-credential', operation], {
        env,
        input: `${Object.entries(fields)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n')}\n\n`,
      });

    it('answers get for https://github.com with the token as an x-access-token login', async () => {
      writeApp();
      await startWith(mintOk);
      const result = await ask('get', { protocol: 'https', host: 'github.com' });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, `username=x-access-token\npassword=${FAKE_TOKEN}\n`);
    });

    for (const [name, fields] of [
      ['another host', { protocol: 'https', host: 'gitlab.example.com' }],
      ['a look-alike host', { protocol: 'https', host: 'github.com.example.com' }],
      ['plain http', { protocol: 'http', host: 'github.com' }],
    ]) {
      it(`says nothing for ${name} and asks GitHub for nothing`, async () => {
        writeApp();
        await startWith(mintOk);
        const result = await ask('get', fields);
        assert.equal(result.status, 0);
        assert.equal(result.stdout, '');
        assert.equal(api.requests.length, 0);
      });
    }

    for (const operation of ['store', 'erase']) {
      it(`does nothing on ${operation}`, async () => {
        writeApp();
        await startWith(mintOk);
        const result = await ask(operation, {
          protocol: 'https',
          host: 'github.com',
          username: 'x',
          password: 'y',
        });
        assert.equal(result.status, 0);
        assert.equal(result.stdout, '');
        assert.equal(api.requests.length, 0);
      });
    }

    it('fails with no output when no token can be minted, so git never gets a wrong login', async () => {
      const result = await ask('get', { protocol: 'https', host: 'github.com' });
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, '');
    });
  });

  describe('setup', () => {
    let checkout;
    let settings;
    const setup = (...args) =>
      run(['setup', ...args], { env, cwd: checkout, script: scriptPath() });
    const read = () => JSON.parse(readFileSync(settings, 'utf8'));
    const scriptPath = () => join(checkout, 'scripts', 'agent-identity.mjs');

    beforeEach(async () => {
      // The script lives in a checkout of its own, so the "main checkout" path is the one under test.
      checkout = join(home, 'checkout');
      mkdirSync(join(checkout, 'scripts'), { recursive: true });
      copyFileSync(SCRIPT, scriptPath());
      execFileSync('git', ['init', '--quiet', checkout], { env });
      settings = join(home, 'settings.local.json');
      writeApp();
      await startWith(mintOk);
    });

    it('needs --assignee and writes nothing without it', async () => {
      const result = await setup('--settings', settings);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /--assignee/);
      assert.equal(existsSync(settings), false);
    });

    it('defaults to .claude/settings.local.json of the main checkout', async () => {
      const result = await setup('--assignee', 'example-owner');
      assert.equal(result.status, 0, result.stderr);
      assert.ok(existsSync(join(checkout, '.claude', 'settings.local.json')));
    });

    it('adds the hook and the env block, keeps every existing key, and never prints a token', async () => {
      const before = {
        permissions: { allow: ['Bash(ls:*)'] },
        hooks: {
          SessionStart: [{ hooks: [{ type: 'command', command: 'echo hi' }] }],
          Stop: [{ hooks: [] }],
        },
        env: { EXISTING: '1' },
      };
      writeFileSync(settings, JSON.stringify(before));
      const result = await setup('--assignee', 'example-owner', '--settings', settings);
      assert.equal(result.status, 0, result.stderr);
      assert.ok(!(result.stdout + result.stderr).includes(FAKE_TOKEN));

      const after = read();
      assert.deepEqual(after.permissions, before.permissions);
      assert.deepEqual(after.hooks.Stop, before.hooks.Stop);
      assert.deepEqual(after.hooks.SessionStart[0], before.hooks.SessionStart[0]);
      assert.equal(after.hooks.SessionStart.length, 2);
      assert.equal(after.env.EXISTING, '1');
      assert.equal(after.env.FIVVI_ASSIGNEE, 'example-owner');
      assert.equal(after.env.GIT_CONFIG_COUNT, '4');
      assert.deepEqual(
        [0, 1, 2, 3].map((i) => [
          after.env[`GIT_CONFIG_KEY_${i}`],
          after.env[`GIT_CONFIG_VALUE_${i}`],
        ]),
        [
          ['user.name', `${SLUG}[bot]`],
          ['user.email', `${BOT_ID}+${SLUG}[bot]@users.noreply.github.com`],
          ['credential.https://github.com.helper', ''],
          ['credential.https://github.com.helper', `!node ${scriptPath()} git-credential`],
        ],
      );
      assert.equal(api.requests.at(-1).url, `/users/${SLUG}%5Bbot%5D`);
      assert.ok(!('GIT_AUTHOR_NAME' in after.env) && !('GIT_COMMITTER_EMAIL' in after.env));
    });

    it('is idempotent: running it twice gives the same file, with one hook', async () => {
      await setup('--assignee', 'example-owner', '--settings', settings);
      const once = readFileSync(settings, 'utf8');
      await setup('--assignee', 'example-owner', '--settings', settings);
      assert.equal(readFileSync(settings, 'utf8'), once);
      assert.equal(read().hooks.SessionStart.length, 1);
    });

    it('--remove undoes exactly what setup added', async () => {
      const before = {
        permissions: { allow: ['Bash(ls:*)'] },
        hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] },
        env: { EXISTING: '1' },
      };
      writeFileSync(settings, JSON.stringify(before));
      await setup('--assignee', 'example-owner', '--settings', settings);
      const result = await setup('--remove', '--settings', settings);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(read(), before);
    });

    it('--remove on a file that only setup made leaves no hooks or env behind', async () => {
      await setup('--assignee', 'example-owner', '--settings', settings);
      await setup('--remove', '--settings', settings);
      assert.deepEqual(read(), {});
    });

    it('does not overwrite a settings file that is not valid JSON', async () => {
      writeFileSync(settings, '{ not json');
      const result = await setup('--assignee', 'example-owner', '--settings', settings);
      assert.notEqual(result.status, 0);
      assert.equal(readFileSync(settings, 'utf8'), '{ not json');
    });

    it('refuses to mix with GIT_CONFIG_* the file already sets', async () => {
      writeFileSync(settings, JSON.stringify({ env: { GIT_CONFIG_COUNT: '1' } }));
      const result = await setup('--assignee', 'example-owner', '--settings', settings);
      assert.notEqual(result.status, 0);
      assert.deepEqual(read(), { env: { GIT_CONFIG_COUNT: '1' } });
    });

    describe('the wiring at work', () => {
      const hookCommand = (file = settings) =>
        JSON.parse(readFileSync(file, 'utf8')).hooks.SessionStart.at(-1).hooks[0].command;
      // What Claude Code does with the hook: run it with CLAUDE_ENV_FILE, then source that file before a Bash command.
      const sourceHook = async (command, hookEnv) => {
        const envFile = join(home, 'claude-env.sh');
        writeFileSync(envFile, '');
        const hook = await exec('sh', ['-c', command], {
          env: { ...hookEnv, CLAUDE_ENV_FILE: envFile },
        });
        assert.equal(hook.status, 0, hook.stderr);
        const sourced = await exec('bash', ['-c', `. "${envFile}"; printf %s "$GH_TOKEN"`], {
          env: hookEnv,
        });
        return { value: sourced.stdout, line: readFileSync(envFile, 'utf8') };
      };

      beforeEach(async () => {
        await setup('--assignee', 'example-owner', '--settings', settings);
      });

      it('the hook exports the token as GH_TOKEN', async () => {
        const { value, line } = await sourceHook(hookCommand(), env);
        assert.equal(value, FAKE_TOKEN);
        assert.match(
          line,
          /^export GH_TOKEN="\$\(node .*agent-identity\.mjs token 2>\/dev\/null \|\| echo fivvi-claude-token-unavailable\)"\n$/,
        );
      });

      it('the hook fails closed: a failure exports an invalid token, never an empty one', async () => {
        rmSync(join(configDir(), 'app.json'));
        const { value } = await sourceHook(hookCommand(), env);
        assert.equal(value, 'fivvi-claude-token-unavailable');
      });

      it('the hook handles a path with a space and a quote in it', async () => {
        const odd = join(home, "my checkout's");
        mkdirSync(join(odd, 'scripts'), { recursive: true });
        copyFileSync(SCRIPT, join(odd, 'scripts', 'agent-identity.mjs'));
        execFileSync('git', ['init', '--quiet', odd], { env });
        const oddSettings = join(home, 'odd-settings.json');
        const result = await run(
          ['setup', '--assignee', 'example-owner', '--settings', oddSettings],
          {
            env,
            cwd: odd,
            script: join(odd, 'scripts', 'agent-identity.mjs'),
          },
        );
        assert.equal(result.status, 0, result.stderr);
        const { value } = await sourceHook(hookCommand(oddSettings), env);
        assert.equal(value, FAKE_TOKEN);
      });

      // The environment Claude Code gives a session with this wiring, on a machine whose own git config would
      // otherwise supply someone else's identity and credentials.
      const sessionEnv = () => {
        const owners = join(home, 'bin', 'owners-helper');
        writeFileSync(
          owners,
          '#!/bin/sh\n[ "$1" = get ] && printf "username=owner\\npassword=owners-stored-login\\n"\nexit 0\n',
        );
        chmodSync(owners, 0o755);
        writeFileSync(
          join(home, '.gitconfig'),
          `[user]\n\tname = Someone Else\n\temail = someone@example.com\n[credential]\n\thelper = !${owners}\n`,
        );
        return { ...env, ...read().env };
      };
      const git = (args, input = '') =>
        exec('git', ['-C', checkout, ...args], { env: sessionEnv(), input });
      const GITHUB = 'protocol=https\nhost=github.com\n\n';

      it('git commits as the bot', async () => {
        const result = await git(['var', 'GIT_AUTHOR_IDENT']);
        assert.equal(result.status, 0, result.stderr);
        assert.match(
          result.stdout,
          new RegExp(
            `^${SLUG}\\[bot\\] <${BOT_ID}\\+${SLUG}\\[bot\\]@users\\.noreply\\.github\\.com> `,
          ),
        );
      });

      it('a -c user.email on the command line still wins over the wiring', async () => {
        const result = await git(['-c', 'user.email=test@example.com', 'config', 'user.email']);
        assert.equal(result.stdout.trim(), 'test@example.com');
      });

      it('git credential fill for github.com gets only the helper of this script, not the stored login', async () => {
        const result = await git(['credential', 'fill'], GITHUB);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /^username=x-access-token$/m);
        assert.match(result.stdout, new RegExp(`^password=${FAKE_TOKEN}$`, 'm'));
        assert.ok(!result.stdout.includes('owners-stored-login'));
      });

      it('git cannot fall back to the stored login for github.com when no token can be minted', async () => {
        rmSync(join(configDir(), 'app.json'));
        const result = await git(['credential', 'fill'], GITHUB);
        assert.notEqual(
          result.status,
          0,
          'git fails instead of asking another helper or a terminal',
        );
        assert.ok(!result.stdout.includes('owners-stored-login'));
      });

      it('other hosts keep git config as it is', async () => {
        const result = await git(
          ['credential', 'fill'],
          'protocol=https\nhost=gitlab.example.com\n\n',
        );
        assert.match(result.stdout, /password=owners-stored-login/);
      });
    });
  });
});

function strayFiles(dir) {
  return execFileSync('ls', ['-A', dir], { encoding: 'utf8' })
    .split('\n')
    .filter((name) => name && !['app.json', 'token.json'].includes(name));
}
