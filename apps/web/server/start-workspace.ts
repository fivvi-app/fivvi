/**
 * The workspace the signed-in home opens (F012): the remembered one when the account is still on
 * its team, else the first by name (`workspaces` comes by name, as `GET /v1/me` lists it), else
 * none, which is the first-run or the no-access page. The one rule, shared by every page that
 * sends a person to "their" workspace; a remembered workspace the person was removed from is
 * skipped without a word.
 */
export function startWorkspace<T extends { slug: string }>(
  workspaces: readonly T[],
  rememberedSlug: string | undefined,
): T | undefined {
  return workspaces.find(({ slug }) => slug === rememberedSlug) ?? workspaces[0];
}
