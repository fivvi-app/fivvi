#!/usr/bin/env node
// Claude Code's own GitHub identity: a GitHub App (fivvi-claude[bot]) instead of the owner's account, so its activity
// is distinct. Other tools (Codex, Copilot) and the owner's terminal are not touched. No dependencies, node only.
//
//   token                        print an installation token (nothing else on stdout); cached, reused while more than
//                                10 minutes remain, scoped to this one repository
//   git-credential get           git credential helper: the token for https://github.com, nothing for other hosts
//   setup --assignee <login>     wire this checkout's git-ignored .claude/settings.local.json: GH_TOKEN for gh, the bot
//                                as git author and the helper as git's credential helper for github.com (git has no
//                                askpass or terminal prompt to fall back to)
//   setup --remove               undo exactly that
//   setup ... --settings <path>  another settings file (the tests', for one); the only other arguments are these
//
// Local config, outside the repo: ~/.config/fivvi-claude/app.json (app_id, slug, keychain_service, installation_id;
// optional: repo, the repository the token is narrowed to, default fivvi; `owner` and other keys are not read). The
// private key is a generic password in the login Keychain (account fivvi-claude, service keychain_service, value: the
// PEM in base64). Failures exit non-zero with one line on stderr that never holds key or
// token material. docs/agents/tools.md has the owner's side.
import { createPrivateKey, createSign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEYCHAIN_ACCOUNT = 'fivvi-claude';
const DEFAULT_REPO = 'fivvi';
const REUSE_WHILE_MS = 10 * 60 * 1000;
// What `gh` gets when no token can be minted. An empty GH_TOKEN would make gh fall back to the owner's own login in
// its keyring; this value is not a token, so GitHub answers 401 and the command fails closed.
const UNAVAILABLE_TOKEN = 'fivvi-claude-token-unavailable';

class Failure extends Error {}

const configDir = () => join(process.env.HOME || homedir(), '.config', 'fivvi-claude');
// The signed JWT goes to this URL, so it is https, or http only on a loopback host (the tests' stand-in for GitHub).
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
function apiBase() {
  const base = (process.env.FIVVI_GITHUB_API || 'https://api.github.com').replace(/\/+$/, '');
  let url;
  try {
    url = new URL(base);
  } catch {
    url = null;
  }
  if (
    !url ||
    !(url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)))
  ) {
    throw new Failure('FIVVI_GITHUB_API must be an https URL, or http on localhost');
  }
  return base;
}
const b64url = (input) => Buffer.from(input).toString('base64url');

function readJson(path, what) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Failure(`${what} not found at ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Failure(`${what} at ${path} is not valid JSON`);
  }
}

function readApp() {
  const app = readJson(join(configDir(), 'app.json'), 'the App config');
  for (const field of ['app_id', 'keychain_service', 'installation_id']) {
    if (app[field] === undefined || app[field] === null || app[field] === '') {
      throw new Failure(`the App config has no ${field}`);
    }
  }
  return app;
}

function readPrivateKey(app) {
  let encoded;
  try {
    encoded = execFileSync(
      'security',
      ['find-generic-password', '-a', KEYCHAIN_ACCOUNT, '-s', String(app.keychain_service), '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 },
    ).trim();
  } catch {
    throw new Failure('could not read the App key from the Keychain');
  }
  try {
    return createPrivateKey(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    throw new Failure('the App key in the Keychain is not a usable private key');
  }
}

function signJwt(app, key, now) {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(app.app_id) }));
  const signature = createSign('RSA-SHA256').update(`${head}.${body}`).sign(key);
  return `${head}.${body}.${b64url(signature)}`;
}

// GitHub's `message`, without anything that could be a credential: long runs of token characters are cut out.
const safeMessage = (text) =>
  String(text ?? '')
    .replace(/[A-Za-z0-9_.\-/+=]{24,}/g, '…')
    .replace(/\s+/g, ' ')
    .slice(0, 120);

async function mint(app, repository) {
  const base = apiBase();
  const jwt = signJwt(app, readPrivateKey(app), Math.floor(Date.now() / 1000));
  let response;
  try {
    response = await fetch(
      `${base}/app/installations/${encodeURIComponent(app.installation_id)}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'fivvi-agent-identity',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ repositories: [repository] }),
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new Failure('could not reach GitHub to mint a token');
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    // no JSON body
  }
  if (!response.ok) {
    throw new Failure(
      `GitHub refused to mint a token (HTTP ${response.status}: ${safeMessage(data?.message)})`,
    );
  }
  if (
    typeof data?.token !== 'string' ||
    !data.token ||
    !Number.isFinite(Date.parse(data?.expires_at))
  ) {
    throw new Failure('GitHub answered without a token');
  }
  return { token: data.token, expires_at: data.expires_at };
}

function writeAtomic(path, text, mode) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, text, { mode });
  chmodSync(temp, mode);
  renameSync(temp, path);
}

async function getToken() {
  const app = readApp();
  const repository = String(app.repo || DEFAULT_REPO);
  const cachePath = join(configDir(), 'token.json');
  try {
    const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
    if (
      typeof cached.token === 'string' &&
      cached.token &&
      cached.installation_id === String(app.installation_id) &&
      cached.repository === repository &&
      Date.parse(cached.expires_at) - Date.now() > REUSE_WHILE_MS
    ) {
      try {
        if (statSync(cachePath).mode & 0o077) chmodSync(cachePath, 0o600);
      } catch {
        // the token is still good
      }
      return cached.token;
    }
  } catch {
    // no usable cache: mint a new one
  }
  const minted = await mint(app, repository);
  try {
    writeAtomic(
      cachePath,
      `${JSON.stringify({ ...minted, installation_id: String(app.installation_id), repository })}\n`,
      0o600,
    );
  } catch {
    // a token that can't be cached is still a token
  }
  return minted.token;
}

async function gitCredential(operation) {
  if (operation !== 'get') return;
  const wanted = {};
  for (const line of readFileSync(0, 'utf8').split('\n')) {
    if (line === '') break;
    const at = line.indexOf('=');
    if (at > 0) wanted[line.slice(0, at)] = line.slice(at + 1);
  }
  if (wanted.protocol !== 'https' || wanted.host !== 'github.com') return;
  const token = await getToken();
  process.stdout.write(`username=x-access-token\npassword=${token}\n`);
}

// --- setup -----------------------------------------------------------------------------------------------------

const shellQuote = (text) =>
  /^[A-Za-z0-9_@%+=:,./-]+$/.test(text) ? text : `'${text.replaceAll("'", `'\\''`)}'`;

// An inherited GIT_DIR, GIT_COMMON_DIR or GIT_WORK_TREE would make every folder look like one repository, and defeat the
// check that setup runs from this checkout. So git is asked without them.
const git = (cwd, ...args) => {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE']) delete env[key];
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env }).trim();
};

// The main checkout: the folder that holds the shared .git, so the wiring survives the removal of a worktree.
function mainCheckout() {
  const here = dirname(fileURLToPath(import.meta.url));
  try {
    return dirname(resolve(here, git(here, 'rev-parse', '--git-common-dir')));
  } catch {
    throw new Failure('this script is not inside a git checkout');
  }
}

const GIT_CONFIG_KEYS = [
  'user.name',
  'user.email',
  'credential.https://github.com.helper',
  'credential.https://github.com.helper',
];
const HOOK_MARKER = 'agent-identity.mjs token';

// One line for the SessionStart env file (Claude Code sources it before each Bash command, in sh and in zsh). Its exports
// win over a value the caller already set; the settings `env` block does not. So the line carries what must win: the
// token (an invalid one when none can be minted, never an empty one) and, so that git has nothing to ask but the helper,
// an askpass program that fails and no terminal prompt.
const ENV_LINE_TAIL = 'GIT_ASKPASS=/usr/bin/false SSH_ASKPASS=/usr/bin/false GIT_TERMINAL_PROMPT=0';

function wiring({ scriptPath, slug, botId, assignee }) {
  const script = shellQuote(scriptPath);
  const line = `GH_TOKEN="$(node ${script} token 2>/dev/null)"; export GH_TOKEN="\${GH_TOKEN:-${UNAVAILABLE_TOKEN}}" ${ENV_LINE_TAIL}`;
  const command = `printf '%s\\n' ${shellQuote(line)} >> "$CLAUDE_ENV_FILE"`;
  const values = [
    `${slug}[bot]`,
    `${botId}+${slug}[bot]@users.noreply.github.com`,
    '',
    `!node ${script} git-credential`,
  ];
  // The default for a session where the hook did not run: an invalid GH_TOKEN, and no terminal prompt. A value the
  // caller already set wins over this block, so an askpass of the caller's is not closed here, only by the hook's line.
  const env = {
    FIVVI_ASSIGNEE: assignee,
    GH_TOKEN: UNAVAILABLE_TOKEN,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: String(values.length),
  };
  values.forEach((value, i) => {
    env[`GIT_CONFIG_KEY_${i}`] = GIT_CONFIG_KEYS[i];
    env[`GIT_CONFIG_VALUE_${i}`] = value;
  });
  return { command, env };
}

const isOurHook = (hook) => String(hook?.command ?? '').includes(HOOK_MARKER);
// The env keys setup writes besides GIT_CONFIG_*.
const OWN_ENV = ['FIVVI_ASSIGNEE', 'GH_TOKEN', 'GIT_TERMINAL_PROMPT'];
// An earlier setup also wrote these two, empty; --remove takes them out of a wired file, only when still empty.
const LEGACY_EMPTY_ENV = ['GIT_ASKPASS', 'SSH_ASKPASS'];

const gitConfigIsOurs = (env) =>
  env.GIT_CONFIG_COUNT === String(GIT_CONFIG_KEYS.length) &&
  GIT_CONFIG_KEYS.every((key, i) => env[`GIT_CONFIG_KEY_${i}`] === key);

// Only what setup added, and only from a file that is wired by it (our hook, our GIT_CONFIG_*, or our invalid GH_TOKEN):
// a key the owner set in a file that was never wired stays. `wired` says whether anything of ours was found.
function stripWiring(settings) {
  const out = { ...settings };
  let wired = false;
  if (out.hooks && Array.isArray(out.hooks.SessionStart)) {
    const kept = [];
    for (const entry of out.hooks.SessionStart) {
      if (!Array.isArray(entry?.hooks) || !entry.hooks.some(isOurHook)) {
        kept.push(entry);
        continue;
      }
      wired = true;
      const rest = entry.hooks.filter((hook) => !isOurHook(hook));
      if (rest.length > 0) kept.push({ ...entry, hooks: rest });
    }
    const hooks = { ...out.hooks };
    if (kept.length > 0) hooks.SessionStart = kept;
    else delete hooks.SessionStart;
    if (Object.keys(hooks).length > 0) out.hooks = hooks;
    else delete out.hooks;
  }
  if (out.env && typeof out.env === 'object') {
    const env = { ...out.env };
    const ours = gitConfigIsOurs(env);
    wired ||= ours || env.GH_TOKEN === UNAVAILABLE_TOKEN;
    if (wired) {
      for (const key of OWN_ENV) delete env[key];
      for (const key of LEGACY_EMPTY_ENV) if (env[key] === '') delete env[key];
    }
    if (ours) {
      delete env.GIT_CONFIG_COUNT;
      GIT_CONFIG_KEYS.forEach((_, i) => {
        delete env[`GIT_CONFIG_KEY_${i}`];
        delete env[`GIT_CONFIG_VALUE_${i}`];
      });
    }
    if (Object.keys(env).length > 0) out.env = env;
    else delete out.env;
  }
  return { settings: out, wired };
}

async function botId(slug) {
  const base = apiBase();
  let response;
  try {
    response = await fetch(`${base}/users/${encodeURIComponent(`${slug}[bot]`)}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'fivvi-agent-identity' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Failure('could not reach GitHub to look up the bot user');
  }
  const data = response.ok ? await response.json().catch(() => null) : null;
  if (!Number.isInteger(data?.id))
    throw new Failure(`could not read the id of ${slug}[bot] (HTTP ${response.status})`);
  return data.id;
}

// The arguments of setup: `--remove`, `--settings <path>` and `--assignee <login>`, nothing else. A missing value, another
// option in its place, a repeated option and any other argument (`--settings=<path>`, a typo) are a Failure: none may
// read as "absent", which would fall back to the default settings file.
function parseSetupArgs(args) {
  const parsed = { remove: false };
  const names = { '--settings': ['settings', 'a path'], '--assignee': ['assignee', 'a value'] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--remove') {
      parsed.remove = true;
    } else if (Object.hasOwn(names, arg)) {
      const [key, what] = names[arg];
      const value = args[i + 1];
      if (!value || value.startsWith('--')) throw new Failure(`${arg} needs ${what}`);
      if (key in parsed) throw new Failure(`${arg} is given twice`);
      parsed[key] = value;
      i++;
    } else {
      throw new Failure('setup takes only --remove, --settings <path> and --assignee <login>');
    }
  }
  return parsed;
}

const commonDir = (cwd) => realpathSync(resolve(cwd, git(cwd, 'rev-parse', '--git-common-dir')));

// An existing file keeps its mode; a new one is 0644.
const modeOf = (path) => (existsSync(path) ? statSync(path).mode & 0o777 : 0o644);

async function setup(args) {
  const { remove, settings: explicit, assignee } = parseSetupArgs(args);
  const main = mainCheckout();
  if (explicit === undefined) {
    // The default file is the main checkout's: only from a folder of this very checkout, never from anywhere else.
    let here;
    try {
      here = commonDir(process.cwd());
    } catch {
      here = null;
    }
    if (here !== commonDir(dirname(fileURLToPath(import.meta.url)))) {
      throw new Failure(
        "without --settings, setup runs only from a folder of this checkout (it writes the checkout's own settings)",
      );
    }
  }
  const path = explicit ?? join(main, '.claude', 'settings.local.json');
  let settings = {};
  if (existsSync(path)) {
    try {
      settings = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      throw new Failure(`${path} is not valid JSON; not touching it`);
    }
    if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
      throw new Failure(`${path} is not a JSON object; not touching it`);
    }
  }
  const { settings: base, wired } = stripWiring(settings);
  if (remove) {
    if (wired) {
      writeAtomic(path, `${JSON.stringify(base, null, 2)}\n`, modeOf(path));
      console.error(`removed the Claude Code GitHub identity from ${path}`);
    } else {
      console.error(`nothing to remove: ${path} was not wired by setup, and is left as it is`);
    }
    return;
  }
  if (assignee === undefined || !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(assignee)) {
    throw new Failure(
      'setup needs --assignee <your GitHub login>: the bot cannot be assigned issues',
    );
  }
  if (base.env && Object.keys(base.env).some((key) => key.startsWith('GIT_CONFIG_'))) {
    throw new Failure(`${path} already sets GIT_CONFIG_* in env; not mixing with it`);
  }
  for (const key of OWN_ENV) {
    if (base.env && key in base.env) {
      throw new Failure(`${path} already sets ${key} in env; not overwriting it`);
    }
  }
  const app = readApp();
  const slug = String(app.slug || '');
  if (!slug) throw new Failure('the App config has no slug');
  const { command, env } = wiring({
    scriptPath: join(main, 'scripts', 'agent-identity.mjs'),
    slug,
    botId: await botId(slug),
    assignee,
  });
  const result = {
    ...base,
    hooks: {
      ...base.hooks,
      SessionStart: [
        ...(base.hooks?.SessionStart ?? []),
        { hooks: [{ type: 'command', command }] },
      ],
    },
    env: { ...base.env, ...env },
  };
  writeAtomic(path, `${JSON.stringify(result, null, 2)}\n`, modeOf(path));
  console.error(
    `wired the Claude Code GitHub identity (${slug}[bot]) in ${path}; start a new Claude Code session`,
  );
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  try {
    if (command === 'token') process.stdout.write(`${await getToken()}\n`);
    else if (command === 'git-credential') await gitCredential(rest[0]);
    else if (command === 'setup') await setup(rest);
    else {
      console.error(
        'usage: agent-identity.mjs token | git-credential get | setup --assignee <login> [--settings <path>] | setup --remove',
      );
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(
      error instanceof Failure ? `agent-identity: ${error.message}` : 'agent-identity: failed',
    );
    process.exitCode = 1;
  }
}

// Run as a program, also through a symlink: both sides are compared as real paths.
function isMain() {
  try {
    return (
      Boolean(process.argv[1]) &&
      realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isMain()) await main();
