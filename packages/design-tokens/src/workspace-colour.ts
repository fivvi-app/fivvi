/**
 * The dot colour of a workspace: picked automatically from its ID, with no setting (owner,
 * 6 November 2026). Every platform runs the same function, so a workspace has one colour
 * everywhere: the 32-bit FNV-1a hash of the ID's UTF-8 bytes, modulo the number of colours.
 * The Swift and Kotlin versions are generated from the same constants (`src/native.ts`).
 */

/** The workspace colours, in the order of `color.workspace.*` in `tokens/color.light.json`. */
export const workspaceColours = ['cyan', 'brown', 'indigo', 'gold', 'slate', 'lime'] as const;
export type WorkspaceColour = (typeof workspaceColours)[number];

export const fnvOffsetBasis = 2166136261;
export const fnvPrime = 16777619;

/** FNV-1a over the UTF-8 bytes of `id`, as an unsigned 32-bit number. */
export function fnv1a(id: string): number {
  let hash = fnvOffsetBasis;
  for (const byte of new TextEncoder().encode(id)) {
    hash = Math.imul(hash ^ byte, fnvPrime) >>> 0;
  }
  return hash;
}

/** The colour of a workspace; its CSS variable is `--workspace-<name>`, its token `color.workspace.<name>`. */
export function workspaceColour(id: string): WorkspaceColour {
  return workspaceColours[fnv1a(id) % workspaceColours.length] ?? 'cyan';
}
