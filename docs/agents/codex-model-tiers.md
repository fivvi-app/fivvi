# Codex: running one delivery flow on three model tiers (Sol, Terra, Luna)

Research note for issue #99, read on 2026-10-17. The last section, **How trainer-hub uses it**, says what the repo ships and what was checked.

## Summary

- **Codex has native subagents with a model pinned per role.** The model starts them with the `spawn_agent` tool. A role is a TOML file in `.codex/agents/*.toml`, or a file referenced from `[agents.<name>] config_file = …` in `config.toml`. The role file can set `model` and `model_reasoning_effort`. The role is applied after any `model` argument on the spawn call, so the role's model wins. This is the Codex counterpart of Claude Code's `.claude/agents/*.md` `model:` and Copilot's `*.agent.md` `model:`.
- **Codex reads the repo's `.codex/` only when the project is trusted.** That covers `.codex/config.toml` and `.codex/agents/`. Trust is set per developer in `~/.codex/config.toml`.
- **A repo can't ship profiles.** `-p/--profile <name>` now loads `$CODEX_HOME/<name>.config.toml`. Codex strips `profile` and `profiles` from project config. Project config also takes precedence over a profile, so profiles are the wrong tool for tiers.
- **Use `codex exec` as the fallback.** `codex exec -m <model> -c model_reasoning_effort=… -C <dir> -s … -o <file> [--json]` is a non-interactive run that a script or an orchestrating session can start and read back. `-m` and `-c` are session flags and override project config.
- **Skill metadata can't set a model.** `agents/openai.yaml` only has `interface`, `dependencies` and `policy`. Unknown keys are silently ignored. `SKILL.md` frontmatter and `AGENTS.md` can't set one either.
- **`codex mcp-server` is gone.** It was removed in 0.154.0. The TypeScript SDK (`@openai/codex-sdk`) wraps `codex exec` and takes `model` and `modelReasoningEffort` per thread.
- **Model ids in today's catalog:** `gpt-6.1-sol` (latest Sol), `gpt-5.6-terra` (the only Terra; marked "older", with an upgrade path to `gpt-6-sol`) and `gpt-6-luna`. There is no `gpt-6-terra`.
- **Recommendation:** add three role files (builder = Terra, reviewer = Sol, mechanic = Luna), declared from a trusted `.codex/config.toml` whose top-level `model` is Sol for the main conversation. Add `scripts/codex-agent.sh <tier> …` around `codex exec` as the fallback and as the testable seam. The last section says how this repo did that.

## Sources and method

- **The official docs couldn't be read.** `developers.openai.com/codex/*` now redirects to `learn.chatgpt.com/docs/...` (for example `/codex/subagents` → `/docs/agent-configuration/subagents`, `/codex/config-reference` → `/docs/config-file/config-reference`), which the corporate proxy blocked while this was researched (HTTP 403). It was not routed around. Every claim below is therefore cited from the **source code of `openai/codex`**, which is the primary source those docs describe. Wherever a doc page would normally be cited, read it when access allows. The repo's own `docs/*.md` are stubs that only link there, for example `docs/config.md:1-7`.
- **Source revision:** `openai/codex` `main` @ `ce0323f2f2d3b25e82806cd555237da3db4e1897` (2026-10-17T04:02Z). Below it is cited as `codex@ce0323f:<path>:<lines>`. The full URL is `https://github.com/openai/codex/blob/ce0323f2f2d3b25e82806cd555237da3db4e1897/<path>#L<a>-L<b>`. The latest stable release is `rust-v0.163.0` (2026-10-15). Installed locally: `codex-cli 0.161.0`.
- **Release notes:** GitHub Releases of `openai/codex` (`rust-v0.1xx.0`), read via `gh api repos/openai/codex/releases`.
- **Local CLI:** `codex --help`, `codex exec --help`, `codex exec review --help` and `codex features list` on 0.161.0.
- **Live model catalog:** `~/.codex/models_cache.json`, fetched by Codex itself at 2026-10-17T07:06:41Z for client 0.163.0. Read only for model slugs and efforts.

---

## 1. Subagents: do they exist, how are they defined, and can each carry a model?

**Yes.** Multi-agent is a stable feature and on by default. `multi_agent` is `Stage::Stable`, `default_enabled: true`. `multi_agent_v2` is stable but off by default, unless the model's catalog entry selects V2 (`codex@ce0323f:codex-rs/features/src/lib.rs:1482-1493`). The backend version is: a feature override, else the model's `multi_agent_version` from the catalog, else V1 (`codex@ce0323f:codex-rs/core/src/config/mod.rs:1640-1667`). All gpt-6 Sol and Luna models are `"multi_agent_version": "v2"` in the catalog (§6). In practice, a Sol main session uses V2. The local `codex features list` shows `multi_agent stable true` and `multi_agent_v2 stable false`. Release notes from 0.157–0.163 are full of subagent work, for example 0.162.0 "#51463 Record resolved model and reasoning effort in sub-agent activity" and 0.163.0 "#52659 Add an opt-in feature for subagent model context defaults".

**The tool call.** The model calls `spawn_agent`.
- **V2 arguments:** `message`, `task_name` (both required), `agent_type`, `model`, `reasoning_effort` and `fork_turns` (`"all"` by default, or `"none"`) (`codex@ce0323f:codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs:201-240`).
- **V1 arguments:** `message`/`items`, `agent_type`, `model`, `reasoning_effort` and `fork_context` (`codex@ce0323f:codex-rs/core/src/tools/handlers/multi_agents/spawn.rs:219-228`).

**Role ("agent type") definitions.** There are two ways to define a role:
1. **A file under `<config folder>/agents/`.** Codex collects every `*.toml` file recursively (`codex@ce0323f:codex-rs/agent-roles/src/discovery.rs:7-39`). It does this for each enabled config layer, using `config_folder.join("agents")` (`codex@ce0323f:codex-rs/agent-roles/src/loader.rs:74-83`). For the project layer, the config folder is the repo's `.codex/` (`codex@ce0323f:codex-rs/config/src/state.rs:219-231`). For the user layer, it is `$CODEX_HOME`. So both `.codex/agents/*.toml` and `~/.codex/agents/*.toml` work.
2. **A declaration in `config.toml`:** `[agents.<name>] description, config_file, nickname_candidates`. "Relative paths are resolved relative to the `config.toml` that defines them" (`codex@ce0323f:codex-rs/config/src/config_toml.rs:779-806`). The doc example:
   ```toml
   [agents.researcher]
   description = "Research-focused role."
   config_file = "./agents/researcher.toml"
   nickname_candidates = ["Herodotus", "Ibn Battuta"]
   ```

**Role file format.** A role file is TOML: `name`, `description` and `nickname_candidates`, plus any `config.toml` key, flattened in (`RawAgentRoleFileToml`, `codex@ce0323f:codex-rs/agent-roles/src/agent_role_config.rs:20-28`).
- **Discovered files** (option 1) must define a non-empty `name` (`…/agent_role_config.rs:73-88`), a `description` (`codex@ce0323f:codex-rs/agent-roles/src/loader.rs:237-250`) and `developer_instructions` (`…/agent_role_config.rs:136-158`).
- **What a role can change.** Only a bounded set of keys is applied. Since 0.149.0 (#39299 "Restrict agent roles to bounded configuration overrides"), these are `developer_instructions`, **`model`, `model_reasoning_effort`**, `model_reasoning_summary`, `model_verbosity`, `personality` and `service_tier`. A role can also *disable* some features and skills (`codex@ce0323f:codex-rs/core/src/agent/role.rs:36-48`, `69-127`).
- **What a role can't change:** sandbox, approval policy or cwd.

**Model precedence for a spawned child** (`prepare_agent_spawn_config`, `codex@ce0323f:codex-rs/core/src/agent/child_config.rs:52-101`):
1. **Start from the parent's model and effort.** The child begins with the parent's effective config, model and reasoning effort (`child_config.rs:110-122`, `132-165`). **Subagents inherit the parent's model by default.**
2. **Apply the spawn override.** If the call's `model`/`reasoning_effort` is set, or `[agents] default_subagent_model`/`default_subagent_reasoning_effort` is, Codex validates it against the model list and the model's supported efforts (`child_config.rs:204-249`, `326-375`). An unknown model gives "Unknown model `…` for spawn_agent. Available models: …", which lists at most 5 models (`child_config.rs:21`, `326-351`).
3. **Apply the role.** `apply_spawn_agent_role` runs after the override, so the role's `model`/`model_reasoning_effort` override whatever the call asked for (`child_config.rs:63-83`, `291-324`). The tool description tells the model so: *"This role's model is set to `{model}` and its reasoning effort is set to `{effort}`. These settings cannot be changed."* (`codex@ce0323f:codex-rs/core/src/agent/role.rs:299-335`).
4. **Copy the parent's runtime policy.** Sandbox and permission profile, approval policy and cwd are always copied from the parent turn (`child_config.rs:175-202`).

**Built-in roles:** `default`, `explorer` and `worker` (`codex@ce0323f:codex-rs/core/src/agent/role.rs:345-407`). The built-in `awaiter.toml` sets `model_reasoning_effort = "low"` (`codex@ce0323f:codex-rs/core/assets/agent/builtins/awaiter.toml`).

**When `agent_type`, `model` and `reasoning_effort` are exposed to the model:**
- **`agent_type`** is exposed only when user-defined roles exist (`expose_agent_type: !agent_roles.is_empty()`, `codex@ce0323f:codex-rs/core/src/tools/spec_plan.rs:1466`).
- **`model` and `reasoning_effort`** are exposed in V2 by default (`expose_spawn_agent_model_overrides: true`, `codex@ce0323f:codex-rs/core/src/config/mod.rs:1396-1412`; schema `codex@ce0323f:codex-rs/core/src/tools/handlers/multi_agents_spec.rs:107-131`, `649-683`).

**What the spawn tool tells the model** (`multi_agents_spec.rs:736-738`): *"sub-agents … inherit your current model by default. Do not set the `model` field unless the user explicitly asks for a different model."* and *"Do not spawn sub-agents unless the user or applicable AGENTS.md/skill instructions explicitly ask for sub-agents, delegation, or parallel agent work."* The V2 `agent_type` description says *"Omit unless explicitly asked."* (`multi_agents_spec.rs:659-663`). **So the `work` skill must name the agent type explicitly.**

**Limits:**
- **V1 depth.** V1 nesting depth defaults to `max_depth = 1` (`codex@ce0323f:codex-rs/core/src/config/mod.rs:266`). Past that, a child gets "Agent depth limit reached. Solve the task yourself." (`multi_agents/spawn.rs:73-79`). V2 ignores `max_depth` (`config_toml.rs:767-768`).
- **Concurrency.** V2 allows 4 threads per session including the root, so 3 children (`config/mod.rs:257`, `1669-1683`). V1 defaults to 6 (`config/mod.rs:256`).

**TUI:** `/agents` ("open the agent command center") and `/multi-agents` ("switch between this session's subagents") (`codex@ce0323f:codex-rs/tui/src/slash_command.rs:144-145`).

## 2. `config.toml`: model, effort, profiles, project config and precedence

**Keys.** Top-level `model`, `model_reasoning_effort`, `plan_mode_reasoning_effort`, `review_model` ("Review model override used by the `/review` feature") and `developer_instructions` (`codex@ce0323f:codex-rs/config/src/config_toml.rs:163-172`, `254`, `398-399`). Under `[agents]`: `enabled`, `max_concurrent_threads_per_session` (alias `max_threads`), `max_depth`, `default_subagent_model`, `default_subagent_reasoning_effort` and the role declarations (`config_toml.rs:756-790`).

**Layers, lowest to highest** (doc comment `codex@ce0323f:codex-rs/config/src/loader/mod.rs:123-136`; numbers in `codex@ce0323f:codex-rs/config/src/config_layer_source.rs:33-51`):

| Layer | Path | Precedence |
|---|---|---|
| system | `/etc/codex/config.toml` | 10 |
| user | `$CODEX_HOME/config.toml` | 20 |
| **profile** | `$CODEX_HOME/<name>.config.toml`, with `--profile` | 21 |
| **project** | `.codex/config.toml` from the repo root down to the cwd; loaded but **disabled when untrusted** | 25 |
| session flags | `-c`, `-m`, the model selector in the UI | 30 |

**Project config.**
- **The project layer is real, but trust-gated.** An untrusted project gets "To load project-local config, hooks, and exec policies, add <path> as a trusted project in ~/.codex/config.toml." (`loader/mod.rs:1113-1131`). Disabled layers are skipped for everything, including agent roles (`codex@ce0323f:codex-rs/config/src/state.rs:603-606`).
- **A `.codex/` directory without `config.toml`** still creates a project layer, "as this may still have subfolders that are significant", for example `agents/` (`loader/mod.rs:1781-1792`).
- **Worktrees** resolve trust through the root repo (`resolve_root_git_project_for_trust`, `loader/mod.rs:1313-1321`). Inferred: a worktree under `.worktrees/` inherits the main checkout's trust.

**Profiles changed, and a repo can't ship them.**
- `-p, --profile <CONFIG_PROFILE_V2>`: "Layer $CODEX_HOME/<name>.config.toml on top of the base user config" (local `codex --help`; `codex@ce0323f:codex-rs/core/src/config/mod.rs:2080-2088`).
- Legacy `profile = "x"` is rejected: "legacy `profile = \"x\"` config is no longer supported; use `--profile x` with `x.config.toml` instead" (`config/mod.rs:3473-3480`).
- A `[profiles.x]` table conflicts with `--profile x` (`loader/mod.rs:296-321`).
- Change history: PRs #17141 (add layered `--profile-v2`, 2026-05-14), #23883 (rename it to `--profile`), and #23886, #24051 and #24055 (remove legacy profile v1), all May 2026.
- **`profile` and `profiles` are on the project denylist.** Codex strips them from `.codex/config.toml`, together with `model_provider(s)`, `openai_base_url`, `notify` and others (`loader/mod.rs:89-102`, `1164-1180`).
- **Gotcha:** project (25) beats profile (21). If `.codex/config.toml` sets `model`, `codex -p small` still runs the project model. Only `-m` or `-c model=…` (30) win.

**Switching mid-session.** `/model` "choose what model and reasoning effort to use" (`codex@ce0323f:codex-rs/tui/src/slash_command.rs:135`). There is no `/profile` command in the slash list (`slash_command.rs:95-161`). A profile can't be swapped in a running session; the model and effort can, by hand.

## 3. Non-interactive runs: `codex exec`

From `codex exec --help` (0.161.0):
- **Model and config:** `-m/--model`, `-p/--profile`, `-c key=value` (TOML-parsed, dotted paths) and `--enable` / `--disable`.
- **Where to run:** `-C/--cd <DIR>` ("use the specified directory as its working root"), `--add-dir`, `--worktree` (new managed git worktree) and `--skip-git-repo-check`.
- **Sandbox:** `-s/--sandbox read-only|workspace-write|danger-full-access` and `--dangerously-bypass-approvals-and-sandbox`.
- **Input and output:** the prompt as an argument or on stdin (`-` or a pipe; stdin is appended as a `<stdin>` block), `--json` (JSONL events on stdout), `-o/--output-last-message <FILE>` and `--output-schema <FILE>` (JSON Schema for the final answer).
- **Session handling:** `--ephemeral` (no session files), `--ignore-user-config`, and the subcommands `resume`, `fork` and `review`.
- `codex exec review` takes `--uncommitted`, `--base`, `--commit` and `-m`.

**Defaults:**
- **Approval:** exec forces "never ask for approvals in headless mode" (`AskForApproval::Never`, `codex@ce0323f:codex-rs/exec/src/lib.rs:586-591`). Failures go straight back to the model.
- **Sandbox:** read-only by default, or `workspace-write` once the directory has a trust decision (`codex@ce0323f:codex-rs/config/src/config_toml.rs:854-862`). On Windows, `workspace-write` falls back to `read-only` when the Windows sandbox is disabled (`config_toml.rs:826-839`).

**JSONL events:** `thread.started` (`thread_id`, usable with `codex exec resume`), `turn.started`, `turn.completed` (`usage`), `turn.failed`, `item.started`, `item.updated`, `item.completed` and `error` (`codex@ce0323f:codex-rs/exec/src/exec_events.rs:13-52`). Items include `agent_message` and `collab_tool_call` (`exec_events.rs:107-138`, `213-260`). The rollout file records the model each turn used (`TurnContextItem.model`, `codex@ce0323f:codex-rs/protocol/src/protocol.rs:3426-3449`). That is how to *prove* which model ran, unless `--ephemeral` was used.

**Can an orchestrator launch exec sub-runs on another model and read the result?** Yes, from a shell script, or from a Codex session through its shell tool. Run `codex exec -m <tier-model> -C <worktree> -o <file> "<brief>"`, then read `<file>` (or parse `--json`). Nothing in the source forbids running `codex` from inside a Codex shell command. Two caveats:
- **The parent sandbox applies to the child process.** It must allow the network and writes to `$CODEX_HOME` (session files, unless `--ephemeral`).
- **Run it from an unsandboxed context in practice.** That means the script, or an approved command. The model-generated command runs inside the parent's sandbox.

## 4. Skills, `agents/openai.yaml` and `AGENTS.md`: can they set a model?

**No.**
- **What `agents/openai.yaml` is.** It is the optional skill metadata file (`SKILLS_METADATA_DIR = "agents"`, `SKILLS_METADATA_FILENAME = "openai.yaml"`, `codex@ce0323f:codex-rs/ext/skills/src/loader/mod.rs:20-21`). Its schema is `interface`, `dependencies` and `policy` (`codex@ce0323f:codex-rs/skills/src/metadata.rs:27-58`):
  - `interface`: `display_name`, `short_description`, `icon_small`, `icon_large`, `brand_color`, `default_prompt` (`codex@ce0323f:codex-rs/skills/src/interface.rs:13-22`).
  - `dependencies.tools[]`: `type`, `value`, `description`, `transport`, `command`, `url`, `oauth`.
  - `policy`: `allow_implicit_invocation`, `products`.

  The structs don't use `deny_unknown_fields`, so a `model:` key would be **silently ignored**. Loading "fails open" (`codex@ce0323f:codex-rs/ext/skills/src/loader/metadata.rs:32`). This repo's files only use `interface.display_name` and `short_description`, for example `.agents/skills/research/agents/openai.yaml`.
- **`SKILL.md` frontmatter** is `name`, `description` and `metadata.short-description` only (`codex@ce0323f:codex-rs/skills/src/parser.rs:6-20`).
- **Where repo skills are read from:** `.agents/skills` in every directory from the project root to the cwd (`codex@ce0323f:codex-rs/ext/skills/src/host_roots.rs:136-170`), plus `.codex/skills` of each project layer (`host_roots.rs:80-128`).
- **`AGENTS.md`** is plain instructions, concatenated from the project root to the cwd (`codex@ce0323f:codex-rs/core/src/agents_md.rs:1-18`). It has no model key. It can still name a role ("spawn `agent_type: reviewer`"), and the spawn tool honours "applicable AGENTS.md/skill instructions" (`multi_agents_spec.rs:738`).
- **Tier routing therefore belongs in roles (§1)** or in the exec wrapper (§3), invoked by the skill text.

## 5. MCP server and SDK

- **`codex mcp-server` no longer exists.** 0.154.0: "The deprecated `codex mcp-server` entry point is no longer available. (#42993)". 0.161.0's subcommand list has no `mcp-server` (`codex@ce0323f:codex-rs/cli/src/main.rs:150-244`). `codex mcp` only manages *external* MCP servers. The integration surface now is `codex app-server` ("[experimental] Run the app server"), which is JSON-RPC, not MCP.
- **TypeScript SDK `@openai/codex-sdk`.** It "wraps the `codex` CLI … spawns the CLI and exchanges JSONL events" (`codex@ce0323f:sdk/typescript/README.md:1-5`).
  - `ThreadOptions` has `model`, `modelReasoningEffort` (`minimal|low|medium|high|xhigh|max|ultra|persistent`), `sandboxMode`, `workingDirectory`, `approvalPolicy` and `additionalDirectories` (`codex@ce0323f:sdk/typescript/src/threadOptions.ts:1-30`).
  - `CodexOptions.config` and `configOverrides` become `--config` flags (`codexOptions.ts:5-27`).
  - Under the hood it runs `exec --experimental-json --model … --config model_reasoning_effort="…"` (`codex@ce0323f:sdk/typescript/src/exec.ts:95-170`).
  - There is no `profile` option.
  - So it is a Node-flavoured version of option §3. Each `codex.startThread({ model: "gpt-6-luna", workingDirectory: wt })` is a sub-run on its own model.
- **Python SDK:** `sdk/python/` exists too. I didn't read it in detail.

## 6. Model identifiers and reasoning efforts

From the bundled catalog `codex@ce0323f:codex-rs/models-manager/models.json`; the live catalog (`~/.codex/models_cache.json`, 2026-10-17, client 0.163.0) has the same slugs:

| Slug | Line | Description (catalog) | Default effort | Supported efforts | Multi-agent |
|---|---|---|---|---|---|
| `gpt-6.1-sol` | 177 | "Latest workhorse model for coding and everyday work." | low | low, medium, high, xhigh, max, ultra | v2 |
| `gpt-6-astra` | 4 | "Frontier intelligence for the most demanding work." | low | low … ultra | v2 |
| `gpt-6-sol` | 353 | "Previous generation workhorse model." | medium | low … ultra | v2 |
| `gpt-6-luna` | 524 | "Fast and affordable model for easier tasks." | medium | low, medium, high, xhigh, max | v2 |
| `gpt-5.6-sol` | 691 | "Older generation workhorse model." (upgrade → `gpt-6-sol`) | low | low … ultra | v2 |
| `gpt-5.6-terra` | 832 | "Older balanced model for straightforward work." (upgrade → `gpt-6-sol`) | medium | low … ultra | v2 |
| `gpt-5.6-luna` | 973 | "Older fast and efficient model." (upgrade → `gpt-6-luna`) | medium | low … max | v1 |

- **There is no `gpt-6-terra` or `gpt-6.1-terra`.** Terra exists only as `gpt-5.6-terra`, and the catalog points its upgrade at `gpt-6-sol`. Expect it to be retired someday; `retirement_at` is `null` today.
- **The wire enum for efforts** is `none, minimal, low, medium, high, xhigh, max, ultra, persistent`, plus unknown model-defined values (`codex@ce0323f:codex-rs/protocol/src/openai_models.rs:62-75`). Codex accepts only what the model lists, so `ultra` fails on Luna (`child_config.rs:353-375`).

## 7. Limitations and gotchas

1. **Trust is per developer and not in git.** Without `[projects."<repo path>"] trust_level = "trusted"` in `~/.codex/config.toml`, Codex skips `.codex/config.toml` and `.codex/agents/`. The roles then don't exist, and subagents run on the parent's model.
2. **Subagents inherit by default.** Without a role or a `model` argument, a child runs on the parent's model and effort. Don't set `[agents] default_subagent_model` here. The reviewer's own `code-review` subagents should inherit Sol from the reviewer, and that setting would push them to the default instead (`child_config.rs:211-214`).
3. **The model is told not to spawn or override unless instructed.** The skill text must say "spawn with `agent_type: builder`", and so on.
4. **V2 forks the whole parent history by default** (`fork_turns` defaults to `all`, `multi_agents_v2/spawn.rs:221-226`). For a fresh builder or reviewer, the brief must say `fork_turns: "none"`. V1 instead rejects `agent_type` together with `fork_context: true` (`child_config.rs:167-173`).
5. **A role can't change the sandbox, approvals or cwd.** The child gets the parent's (`child_config.rs:175-202`).
6. **The sandbox protects `.git`, `.agents` and `.codex` under writable roots** (`codex@ce0323f:codex-rs/protocol/src/permissions.rs:860-863`). For a worktree, the resolved gitdir is protected as well (`permissions.rs:2360-2403`). **A `workspace-write` builder can't `git commit` in `.worktrees/<branch>` without an approval or escalation.** `codex exec` never asks, so the commit fails. This holds whatever the model. A per-run writable root lifts it (see the last section).
7. **V1 depth limit 1.** A V1 subagent can't spawn again. That matters if the main session ever runs on a V1 model such as `gpt-5.6-luna`. V2 ignores depth.
8. **Concurrency.** V2 runs 3 children at once by default, which matches `work`'s "at most three".
9. **Profiles can't carry tiers in the repo** (§2). Project `model` overrides `--profile`, so the wrapper must use `-m`/`-c`, not `-p`.
10. **Cost and usage.** Every child and every exec run is a separate model session counted against the same account's usage. `service_tier` from the parent is applied to children only if the child model supports it (`child_config.rs:263-289`).
11. **Codex cloud has no model flag.** `codex cloud exec` accepts only `QUERY`, `--env`, `--attempts` (best-of-N) and `--branch` (`codex@ce0323f:codex-rs/cloud-tasks/src/cli.rs:29-50`). Not verified: whether cloud tasks apply repo `.codex/agents` roles. Tier routing should stay local.
12. **IDE extension: not verified.** The extension is closed source and its docs were unreadable here. Inferred: it drives the same agent through `codex app-server`, so the same config layers, roles and `/model` apply. Check this in the extension.
13. **Windows:** `workspace-write` silently falls back to `read-only` when the Windows sandbox is disabled (`config_toml.rs:826-839`). macOS uses Seatbelt; nothing tier-specific.

---

## How trainer-hub uses it

**One home for the tiers.** `.agents/agents/tiers.json` holds the model of each tier for Claude Code, Copilot and Codex; `.agents/agents/<name>.md` holds each agent's description, tier and instructions. `scripts/agents.sh sync` generates `.claude/agents/`, `.github/agents/` and `.codex/agents/` from them, and `scripts/agents.sh check` (part of `scripts/check.sh` and CI) fails when a definition has no tier, a tool has no model for a tier, or a generated file differs. The Codex part of the table:

| Agent | Tier | Model | Effort |
|---|---|---|---|
| main conversation, `reviewer` | high | `gpt-6.1-sol` | high |
| `builder` | mid | `gpt-5.6-terra` | medium |
| `mechanic` | small | `gpt-6-luna` | low |

**Files.**
- `.codex/config.toml`: `model` and `review_model` are Sol, `[agents] max_threads = 3`, no `default_subagent_model` (gotcha 2).
- `.codex/agents/{builder,reviewer,mechanic}.toml`: generated roles (`name`, `description`, `model`, `model_reasoning_effort`, `developer_instructions`), found by auto-discovery (`agent-roles/src/discovery.rs:7-39`). They are generated rather than declared with `[agents.<name>] config_file`, so there is one source for all three tools.
- `scripts/codex-agent.sh <high|mid|small> <dir> <prompt-file|->`: `codex exec -m <model> -c model_reasoning_effort="<effort>" -C <dir>` with the prompt on stdin, printing the final message. Tested with a fake `codex` (`scripts/test/agents.test.mjs`).

**How `work` uses them under Codex.** `spawn_agent` with an explicit `agent_type` and `fork_turns: "none"` for the `reviewer`; the `builder` and a committing `mechanic` through the wrapper, for the sandbox reason below. If `agent_type` isn't offered (the project isn't trusted, gotcha 1), the wrapper starts every tier.

**The sandbox decision (owner, 2026-10-17): a writable root, never `danger-full-access`.**
- A role can't change the sandbox (gotcha 5), so a native `builder` can't commit in a worktree (gotcha 6). A run can: `codex exec -c` takes a permission profile.
- The wrapper gives the `mid` and `small` tiers, in a linked worktree, `default_permissions = "agent"` with `permissions.agent = { extends = ":workspace", filesystem = { … = "write" } }`. The paths are that worktree's git dir (`<main>/.git/worktrees/<name>`) and, in the shared git dir, `objects` plus the ref (`refs/heads/<branch>` and its `.lock`) and reflog (`logs/refs/heads/<branch>`) of the worktree's own branch. A worktree's own git dir isn't enough: the objects and the branch ref live in the shared one. No other branch, not even local `main`, is writable; a detached HEAD gets no ref paths.
- Hooks, `config` and the rest of `.git` stay read-only. A read-only entry inside a writable root wins, and the wrapper uses that for what could repoint git or run code when the orchestrator later runs git *outside* the sandbox: `<worktree git dir>/commondir` (a repointed one would load another `config`, with `core.fsmonitor` or `core.hooksPath`), `gitdir`, `config.worktree`, `objects/info` (alternates) and the worktree's `.githooks` (`core.hooksPath=.githooks` is relative to the worktree, so a hook the builder wrote would run on the orchestrator's commit or merge). The gitfile `.git` in the worktree is already protected by `:workspace`.
- The `high` tier runs `-s read-only`. Outside a linked worktree the wrapper uses `-s workspace-write`.
- Still protected in `workspace-write`: `.agents/` and `.codex/` (`permissions.rs:860-863`). A builder can't edit skills, agent definitions or Codex config; that work is for the orchestrator.
- If a native `builder` is used anyway, it leaves its changes uncommitted and the orchestrator (or a `mechanic` through the wrapper) commits them.

**Checked on 2026-10-17 (`codex-cli 0.161.0`, macOS).**
- `codex sandbox -P agent -c <profile from the wrapper> -C <worktree> -- …` commits in a linked worktree. The default `:workspace` profile fails on `index.lock`; the worktree git dir alone fails on the object write. Denied (`Operation not permitted`): writing `commondir`, `gitdir`, `config.worktree`, `objects/info/alternates`, `.githooks/*` (existing or new), the worktree's `.git`, `config` in the shared git dir, and the refs of `main` and of another `feature/*` branch. `git` prints a harmless `packed-refs.lock` error after the commit.
- `scripts/codex-agent.sh` runs of each tier reached Codex with the right model and effort: the rollout's `turn_context` shows `gpt-6.1-sol` with `high`, `gpt-5.6-terra` with `medium` and `gpt-6-luna` with `low`, and for `mid` the `workspace-write` policy with the writable roots of the profile above. The model call itself was refused by the proxy on the machine used (HTTP 403 from `chatgpt.com/backend-api`), so no reply came back from the models. Repeat it once where Codex can reach OpenAI: run the wrapper per tier with a trivial prompt and read `turn_context.model` from `~/.codex/sessions/…`; in a session, `/agents` and the `collab_tool_call` item show the child's model.

### What can't be done (today)

- **Pin a model in the skill itself** (`openai.yaml`, `SKILL.md`) or in `AGENTS.md`.
- **Ship profiles in the repo,** or switch profile mid-session.
- **Choose a model for a Codex cloud task** from the CLI.
- **Run Codex "as an MCP server";** that was removed in 0.154.0.
- **Make roles work without each developer trusting the repo** once.
- **Give a native role its own sandbox.** Use the wrapper.

## Open questions

1. **The official docs pages,** to read when access allows: `learn.chatgpt.com/docs/agent-configuration/subagents`, `…/config-file/config-reference` and the `config-advanced#profiles` anchor that the error message links. Confirm the documented role-file format matches the source above.
2. **Terra's future.** `gpt-5.6-terra` is the only Terra and is labelled "older" with an upgrade to `gpt-6-sol`. When it goes, change the `mid` tier in `tiers.json` (for example `gpt-6-sol` at `medium`) and run `scripts/agents.sh sync`.
3. **The IDE extension and Codex cloud** honouring project roles: check by hand.
4. **A real round trip per tier** where Codex can reach OpenAI (see above).
