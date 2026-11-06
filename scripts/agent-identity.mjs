#!/usr/bin/env node
// Claude Code's own GitHub identity: a GitHub App (fivvi-claude[bot]) instead of the owner's account, so its activity
// is distinct. Other tools (Codex, Copilot) and the owner's terminal are not touched. No dependencies, node only.
//
//   token                        print an installation token (nothing else on stdout); cached, reused while more than
//                                10 minutes remain, scoped to this one repository
//   git-credential get           git credential helper: the token for https://github.com, nothing for other hosts
//   setup --assignee <login>     wire this checkout's git-ignored .claude/settings.local.json: GH_TOKEN for gh, the bot
//                                as git author and the helper as git's only credential source for github.com
//   setup --remove               undo exactly that
//
// Local config, outside the repo: ~/.config/fivvi-claude/app.json (app_id, slug, owner, keychain_service,
// installation_id). The private key is a generic password in the login Keychain (account fivvi-claude, service
// keychain_service, value: the PEM in base64). Failures exit non-zero with one line on stderr that never holds key or
// token material. docs/agents/tools.md has the owner's side.
import { createPrivateKey, createSign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEYCHAIN_ACCOUNT = 'fivvi-claude';
const DEFAULT_REPO = 'fivvi';
const REUSE_WHILE_MS = 10 * 60 * 1000;
// What `gh` gets when no token can be minted. An empty GH_TOKEN would make gh fall back to the owner's own login in
// its keyring; this value is not a token, so GitHub answers 401 and the command fails closed.
export const UNAVAILABLE_TOKEN = 'fivvi-claude-token-unavailable';

class Failure extends Error {}

const configDir = () => join(process.env.HOME || homedir(), '.config', 'fivvi-claude');
const apiBase = () =>
  (process.env.FIVVI_GITHUB_API || 'https://api.github.com').replace(/\/+$/, '');
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
  const jwt = signJwt(app, readPrivateKey(app), Math.floor(Date.now() / 1000));
  let response;
  try {
    response = await fetch(
      `${apiBase()}/app/installations/${encodeURIComponent(app.installation_id)}/access_tokens`,
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

export async function getToken() {
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

const git = (cwd, ...args) =>
  execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();

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

function wiring({ scriptPath, slug, botId, assignee }) {
  const script = shellQuote(scriptPath);
  const line = `export GH_TOKEN="$(node ${script} token 2>/dev/null || echo ${UNAVAILABLE_TOKEN})"`;
  const command = `printf '%s\\n' ${shellQuote(line)} >> "$CLAUDE_ENV_FILE"`;
  const values = [
    `${slug}[bot]`,
    `${botId}+${slug}[bot]@users.noreply.github.com`,
    '',
    `!node ${script} git-credential`,
  ];
  const env = {
    FIVVI_ASSIGNEE: assignee,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: String(values.length),
  };
  values.forEach((value, i) => {
    env[`GIT_CONFIG_KEY_${i}`] = GIT_CONFIG_KEYS[i];
    env[`GIT_CONFIG_VALUE_${i}`] = value;
  });
  return { command, env };
}

const isOurHook = (entry) =>
  Array.isArray(entry?.hooks) &&
  entry.hooks.some((hook) => String(hook?.command ?? '').includes(HOOK_MARKER));

function stripWiring(settings) {
  const out = { ...settings };
  if (out.hooks && Array.isArray(out.hooks.SessionStart)) {
    const kept = out.hooks.SessionStart.filter((entry) => !isOurHook(entry));
    const hooks = { ...out.hooks };
    if (kept.length > 0) hooks.SessionStart = kept;
    else delete hooks.SessionStart;
    if (Object.keys(hooks).length > 0) out.hooks = hooks;
    else delete out.hooks;
  }
  if (out.env && typeof out.env === 'object') {
    const env = { ...out.env };
    delete env.FIVVI_ASSIGNEE;
    delete env.GIT_TERMINAL_PROMPT;
    const ours =
      env.GIT_CONFIG_COUNT === String(GIT_CONFIG_KEYS.length) &&
      GIT_CONFIG_KEYS.every((key, i) => env[`GIT_CONFIG_KEY_${i}`] === key);
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
  return out;
}

async function botId(slug) {
  let response;
  try {
    response = await fetch(`${apiBase()}/users/${encodeURIComponent(`${slug}[bot]`)}`, {
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

function option(args, name) {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
}

async function setup(args) {
  const main = mainCheckout();
  const path = option(args, '--settings') ?? join(main, '.claude', 'settings.local.json');
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
  const base = stripWiring(settings);
  if (args.includes('--remove')) {
    if (existsSync(path)) writeAtomic(path, `${JSON.stringify(base, null, 2)}\n`, 0o644);
    console.error(`removed the Claude Code GitHub identity from ${path}`);
    return;
  }
  const assignee = option(args, '--assignee');
  if (!assignee || !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(assignee)) {
    throw new Failure(
      'setup needs --assignee <your GitHub login>: the bot cannot be assigned issues',
    );
  }
  if (base.env && Object.keys(base.env).some((key) => key.startsWith('GIT_CONFIG_'))) {
    throw new Failure(`${path} already sets GIT_CONFIG_* in env; not mixing with it`);
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
  writeAtomic(path, `${JSON.stringify(result, null, 2)}\n`, 0o644);
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
