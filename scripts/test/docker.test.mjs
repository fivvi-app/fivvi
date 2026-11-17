import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  readdirSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

const SCRIPTS = join(import.meta.dirname, '..');
const HELPER = join(SCRIPTS, '_docker.sh');
const PREFIX = '/fake/homebrew';
const PLUGIN_DIR = `${PREFIX}/lib/docker/cli-plugins`;
const COLIMA_START = 'colima start --cpu 2 --memory 4 --disk 30 --vm-type vz --mount-type virtiofs';

const jq = spawnSync('/bin/sh', ['-c', 'command -v jq'], { encoding: 'utf8' }).stdout.trim();

// ensure_docker (scripts/_docker.sh) sets up Colima as the local Docker runtime for `pnpm db:up`. Run in bash 3.2 with
// fake brew, colima and docker on PATH that log every call and keep their state in files, and a temporary HOME.
describe('E003 ensure_docker: local Docker through Colima (scripts/_docker.sh)', () => {
  let base;
  const bin = () => join(base, 'bin');
  const home = () => join(base, 'home');
  const state = (name) => join(base, name);
  const log = () => join(base, 'calls.log');
  const config = () => join(home(), '.docker', 'config.json');
  const calls = () => (existsSync(log()) ? readFileSync(log(), 'utf8').trim().split('\n') : []);
  const configJson = () => JSON.parse(readFileSync(config(), 'utf8'));

  const write = (path, text) => {
    writeFileSync(path, text);
    chmodSync(path, 0o755);
  };
  const touch = (name) => writeFileSync(state(name), '');

  // The fakes log "<tool> <args>" and answer from state files: docker-up (docker info works), compose-ok (docker compose
  // version works). `brew services start colima` brings Docker up, unless never-up exists (then it never answers).
  // `colima start` writes the profile ~/.colima/default/colima.yaml, as the real one does.
  const addFakes = ({ withBrew = true } = {}) => {
    const logLine = (tool) => `echo "${tool} $*" >> "${log()}"`;
    if (withBrew)
      write(
        join(bin(), 'brew'),
        `#!/bin/sh
${logLine('brew')}
case "$1 $2" in
  "--prefix ") echo "${PREFIX}" ;;
  "services start") [ -e "${state('never-up')}" ] || : > "${state('docker-up')}" ;;
esac
exit 0
`,
      );
    write(
      join(bin(), 'colima'),
      `#!/bin/sh
${logLine('colima')}
case "$1" in
  start) mkdir -p "$HOME/.colima/default" && : > "$HOME/.colima/default/colima.yaml" ;;
esac
`,
    );
    write(
      join(bin(), 'docker'),
      `#!/bin/sh
${logLine('docker')}
case "$1" in
  info) [ -e "${state('docker-up')}" ] ;;
  compose) [ -e "${state('compose-ok')}" ] ;;
esac
`,
    );
  };

  const profile = () => join(home(), '.colima', 'default', 'colima.yaml');
  const writeProfile = () => {
    mkdirSync(join(home(), '.colima', 'default'), { recursive: true });
    writeFileSync(profile(), 'memory: 6\n');
  };

  const ensure = (extraEnv = {}) =>
    spawnSync('/bin/bash', ['-c', `source "${HELPER}"; ensure_docker; echo "status=$?"`], {
      encoding: 'utf8',
      env: {
        PATH: `${bin()}:/usr/bin:/bin`,
        HOME: home(),
        DOCKER_WAIT_SECONDS: '0',
        ...extraEnv,
      },
      timeout: 30_000,
    });
  const status = (result) => result.stdout.match(/status=(\d+)/)?.[1];

  beforeEach(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'docker-')));
    mkdirSync(bin());
    mkdirSync(home());
    if (jq) symlinkSync(jq, join(bin(), 'jq'));
    addFakes();
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it('does nothing when Docker already answers, whatever the runtime', () => {
    touch('docker-up');
    mkdirSync(join(home(), '.docker'));
    writeFileSync(config(), '{"auths":{}}\n');
    const result = ensure();
    assert.equal(status(result), '0', result.stderr);
    assert.deepEqual(calls(), ['docker info']);
    assert.equal(readFileSync(config(), 'utf8'), '{"auths":{}}\n');
  });

  it('installs colima, docker and docker-compose, finds the compose plugin, and starts Colima at login', () => {
    mkdirSync(join(home(), '.docker'));
    writeFileSync(config(), '{"auths":{"example.com":{}},"currentContext":"colima"}\n');
    const result = ensure();
    assert.equal(status(result), '0', result.stdout + result.stderr);
    assert.deepEqual(
      calls().filter((line) => !line.startsWith('docker ')),
      [
        'brew install colima docker docker-compose',
        'brew --prefix',
        COLIMA_START,
        'colima stop',
        'brew services start colima',
      ],
    );
    assert.ok(existsSync(profile()));
    assert.deepEqual(configJson(), {
      auths: { 'example.com': {} },
      currentContext: 'colima',
      cliPluginsExtraDirs: [PLUGIN_DIR],
    });
  });

  it('creates ~/.docker/config.json with just the plugin directory when there is none', () => {
    const result = ensure();
    assert.equal(status(result), '0', result.stdout + result.stderr);
    assert.deepEqual(configJson(), { cliPluginsExtraDirs: [PLUGIN_DIR] });
  });

  it('keeps other plugin directories and does not add its own twice', () => {
    mkdirSync(join(home(), '.docker'));
    writeFileSync(config(), JSON.stringify({ cliPluginsExtraDirs: ['/other', PLUGIN_DIR] }));
    const result = ensure();
    assert.equal(status(result), '0', result.stdout + result.stderr);
    assert.deepEqual(configJson(), { cliPluginsExtraDirs: ['/other', PLUGIN_DIR] });
  });

  it('appends to the plugin directories already there', () => {
    mkdirSync(join(home(), '.docker'));
    writeFileSync(config(), JSON.stringify({ cliPluginsExtraDirs: ['/other'] }));
    ensure();
    assert.deepEqual(configJson(), { cliPluginsExtraDirs: ['/other', PLUGIN_DIR] });
  });

  it('leaves config.json alone when docker compose already works', () => {
    touch('compose-ok');
    mkdirSync(join(home(), '.docker'));
    writeFileSync(config(), '{"auths":{}}\n');
    const result = ensure();
    assert.equal(status(result), '0', result.stdout + result.stderr);
    assert.equal(readFileSync(config(), 'utf8'), '{"auths":{}}\n');
  });

  it('does not create config.json when docker compose already works', () => {
    touch('compose-ok');
    ensure();
    assert.equal(existsSync(config()), false);
  });

  it('only starts the login service when the Colima profile exists, so a raised memory stays', () => {
    writeProfile();
    const result = ensure();
    assert.equal(status(result), '0', result.stdout + result.stderr);
    assert.deepEqual(
      calls().filter((line) => !line.startsWith('docker ')),
      ['brew install colima docker docker-compose', 'brew --prefix', 'brew services start colima'],
    );
    assert.equal(readFileSync(profile(), 'utf8'), 'memory: 6\n');
  });

  it('waits for Docker, polling with sleep, and succeeds once it answers', () => {
    const answers = join(base, 'info-calls-after-start');
    // docker info answers on its third call after the login service started; sleep returns at once.
    write(join(bin(), 'sleep'), `#!/bin/sh\necho "sleep $*" >> "${log()}"\n`);
    write(
      join(bin(), 'brew'),
      `#!/bin/sh
echo "brew $*" >> "${log()}"
[ "$1" = --prefix ] && echo "${PREFIX}"
[ "$1 $2" = "services start" ] && : > "${state('started')}"
exit 0
`,
    );
    write(
      join(bin(), 'docker'),
      `#!/bin/sh
case "$1" in
  info)
    [ -e "${state('started')}" ] || exit 1
    echo x >> "${answers}"
    [ "$(wc -l < "${answers}")" -ge 3 ] ;;
  compose) exit 1 ;;
esac
`,
    );
    const result = ensure({ DOCKER_WAIT_SECONDS: '5' });
    assert.equal(status(result), '0', result.stdout + result.stderr);
    assert.equal(calls().filter((line) => line.startsWith('sleep')).length, 2);
  });

  it('returns 1 and names Homebrew when brew is missing', () => {
    rmSync(join(bin(), 'brew'));
    const result = ensure();
    assert.equal(status(result), '1');
    assert.match(result.stderr, /Homebrew/);
    assert.deepEqual(
      calls().filter((line) => !line.startsWith('docker ')),
      [],
    );
  });

  it('returns 1, without waiting, when Docker does not come up within the wait', () => {
    touch('never-up');
    const result = ensure({ DOCKER_WAIT_SECONDS: '0' });
    assert.equal(status(result), '1');
    assert.match(result.stderr, /Docker did not start within 0 seconds/);
    assert.ok(calls().includes('brew services start colima'));
  });

  it('returns 1 and stops when a brew install fails', () => {
    write(join(bin(), 'brew'), `#!/bin/sh\necho "brew $*" >> "${log()}"\nexit 1\n`);
    const result = ensure();
    assert.equal(status(result), '1');
    assert.match(result.stderr, /brew install colima docker docker-compose/);
    assert.deepEqual(
      calls().filter((line) => line.startsWith('colima')),
      [],
    );
  });

  // A colima that fails on the given subcommand (and records every call).
  const colimaFailing = (subcommand) =>
    write(
      join(bin(), 'colima'),
      `#!/bin/sh
echo "colima $*" >> "${log()}"
[ "$1" = start ] && { mkdir -p "$HOME/.colima/default"; : > "$HOME/.colima/default/colima.yaml"; }
[ "$1" = ${subcommand} ] && exit 1
exit 0
`,
    );

  it('returns 1 when colima start fails', () => {
    colimaFailing('start');
    const result = ensure();
    assert.equal(status(result), '1');
    assert.match(result.stderr, /colima start/);
    assert.ok(!calls().includes('colima stop'));
    assert.ok(!calls().includes('brew services start colima'));
  });

  it('returns 1 when colima stop fails', () => {
    colimaFailing('stop');
    const result = ensure();
    assert.equal(status(result), '1');
    assert.match(result.stderr, /colima stop/);
    assert.ok(!calls().includes('brew services start colima'));
  });

  it('returns 1 when brew services start colima fails', () => {
    write(
      join(bin(), 'brew'),
      `#!/bin/sh
echo "brew $*" >> "${log()}"
[ "$1" = --prefix ] && echo "${PREFIX}"
[ "$1 $2" = "services start" ] && exit 1
exit 0
`,
    );
    const result = ensure();
    assert.equal(status(result), '1');
    assert.match(result.stderr, /brew services start colima/);
  });

  it('returns 1 and names jq when it is missing and the config has to change', () => {
    rmSync(join(bin(), 'jq'));
    // Only the tools the helper needs, and no jq (some macOS versions have one in /usr/bin).
    const tools = join(base, 'tools');
    mkdirSync(tools);
    for (const tool of ['mkdir', 'mktemp', 'mv', 'rm', 'sleep'])
      symlinkSync(
        `/bin/${existsSync(`/bin/${tool}`) ? tool : `../usr/bin/${tool}`}`,
        join(tools, tool),
      );
    const result = ensure({ PATH: `${bin()}:${tools}` });
    assert.equal(status(result), '1');
    assert.match(result.stderr, /jq/);
    assert.equal(existsSync(config()), false);
    assert.ok(!calls().includes(COLIMA_START));
  });

  it('writes a symlinked config.json (dotfiles) through the link, and keeps its mode', () => {
    const real = join(base, 'dotfiles', 'docker-config.json');
    mkdirSync(join(base, 'dotfiles'));
    mkdirSync(join(home(), '.docker'));
    writeFileSync(real, '{"auths":{}}\n');
    chmodSync(real, 0o600);
    symlinkSync(real, config());
    const result = ensure();
    assert.equal(status(result), '0', result.stdout + result.stderr);
    assert.ok(lstatSync(config()).isSymbolicLink());
    assert.deepEqual(JSON.parse(readFileSync(real, 'utf8')), {
      auths: {},
      cliPluginsExtraDirs: [PLUGIN_DIR],
    });
    assert.equal(statSync(real).mode & 0o777, 0o600);
  });

  it('leaves no temporary file next to config.json', () => {
    ensure();
    assert.deepEqual(readdirSync(join(home(), '.docker')), ['config.json']);
  });

  it('returns 1 and leaves config.json as it was when it is not valid JSON', () => {
    mkdirSync(join(home(), '.docker'));
    writeFileSync(config(), '{not json');
    const result = ensure();
    assert.equal(status(result), '1');
    assert.match(result.stderr, /config\.json/);
    assert.equal(readFileSync(config(), 'utf8'), '{not json');
  });
});

describe('E003 bootstrap.sh and check.sh use the Docker helper', () => {
  const read = (name) => readFileSync(join(SCRIPTS, name), 'utf8');

  it('bootstrap.sh sources the helper and warns, naming Colima and pnpm db:up, when it fails', () => {
    const bootstrap = read('bootstrap.sh');
    assert.match(bootstrap, /source "\$ROOT\/scripts\/_docker\.sh"/);
    assert.match(bootstrap, /ensure_docker \|\| warn ".*Colima.*pnpm db:up/);
    assert.doesNotMatch(bootstrap, /install Docker Desktop/);
  });

  it('check.sh and maestro.sh tell how to start Docker with Colima, through the login service', () => {
    for (const name of ['check.sh', 'maestro.sh'])
      assert.match(
        read(name),
        /Docker is not running — start it with brew services start colima, or set it up with scripts\/bootstrap\.sh/,
        name,
      );
  });

  it('bootstrap.sh warns to fix the cause and run itself again, naming Colima and pnpm db:up', () => {
    assert.match(
      read('bootstrap.sh'),
      /ensure_docker \|\| warn ".*Colima.*fix.*run scripts\/bootstrap\.sh again.*pnpm db:up/,
    );
  });
});
