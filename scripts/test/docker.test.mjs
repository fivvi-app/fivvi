import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
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
  // version works), colima-running (colima status works). `brew services start colima` brings Docker up, unless
  // never-up exists (then it never answers). colima start with a fresh profile leaves Colima running; stop ends it.
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
  status) [ -e "${state('colima-running')}" ] ;;
  start) : > "${state('colima-running')}" ;;
  stop) rm -f "${state('colima-running')}" ;;
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

  const ensure = (extraEnv = {}) =>
    spawnSync('/bin/bash', ['-c', `source "${HELPER}"; ensure_docker; echo "status=$?"`], {
      encoding: 'utf8',
      env: {
        PATH: `${bin()}:/usr/bin:/bin`,
        HOME: home(),
        DOCKER_WAIT_SECONDS: '2',
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
        'colima status',
        COLIMA_START,
        'colima stop',
        'brew services start colima',
      ],
    );
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

  it('does not start Colima again when it is already running', () => {
    touch('colima-running');
    const result = ensure();
    assert.equal(status(result), '1', 'Docker never comes up: nothing started the login service');
    const lines = calls();
    assert.ok(lines.includes('colima status'));
    assert.ok(!lines.includes(COLIMA_START));
    assert.ok(!lines.includes('colima stop'));
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

  it('returns 1 within the wait when Docker never comes up', () => {
    touch('never-up');
    const started = Date.now();
    const result = ensure({ DOCKER_WAIT_SECONDS: '2' });
    assert.equal(status(result), '1');
    assert.match(result.stderr, /Docker did not start within 2 seconds/);
    assert.ok(Date.now() - started < 15_000);
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

  it('returns 1 when colima start fails', () => {
    write(
      join(bin(), 'colima'),
      `#!/bin/sh\necho "colima $*" >> "${log()}"\n[ "$1" = status ] && exit 1\nexit 1\n`,
    );
    const result = ensure();
    assert.equal(status(result), '1');
    assert.match(result.stderr, /colima start/);
    assert.ok(!calls().includes('brew services start colima'));
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

  it('check.sh tells how to start Docker with Colima', () => {
    assert.match(
      read('check.sh'),
      /Docker is not running — start it with colima start, or set it up with scripts\/bootstrap\.sh/,
    );
  });
});
