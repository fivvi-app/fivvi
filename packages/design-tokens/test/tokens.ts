import type { TokenTree } from '../src/source.ts';

type Node = Record<string, unknown>;

/** The group that holds the token at `tokenPath` in `tree`, and the token's key in it. */
function parentOf(tree: TokenTree, tokenPath: string): [Node, string] {
  const segments = tokenPath.split('.');
  const leaf = segments.pop() ?? '';
  let node = tree as Node;
  for (const segment of segments) node = node[segment] as Node;
  if (!(node?.[leaf] as Node | undefined)?.$value) throw new Error(`No token at ${tokenPath}`);
  return [node, leaf];
}

/** A copy of `tree` without the token at `tokenPath`. */
export function withoutToken(tree: TokenTree, tokenPath: string): TokenTree {
  const copy = structuredClone(tree);
  const [group, key] = parentOf(copy, tokenPath);
  delete group[key];
  return copy;
}

/** A copy of `tree` with the `$value` of the token at `tokenPath` replaced. */
export function withValue(tree: TokenTree, tokenPath: string, value: unknown): TokenTree {
  const copy = structuredClone(tree);
  const [group, key] = parentOf(copy, tokenPath);
  (group[key] as Node).$value = value;
  return copy;
}
