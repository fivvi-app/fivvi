// The environment a test hands to the scripts it spawns, without the identity of the session that runs the tests.
// Claude Code sessions export GH_TOKEN, FIVVI_ASSIGNEE and GIT_CONFIG_* (scripts/agent-identity.mjs); GIT_CONFIG_*
// outranks `git config --local`, so a test that sets user.email locally would otherwise get the bot's. A test that
// wants one of them sets it after calling this.
export const IDENTITY_VARS =
  /^(GH_TOKEN|GITHUB_TOKEN|FIVVI_ASSIGNEE|GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+|PARAMETERS))$/;

export function cleanEnv(base = process.env) {
  return Object.fromEntries(Object.entries(base).filter(([name]) => !IDENTITY_VARS.test(name)));
}
