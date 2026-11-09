/** How the API refused a field: `too_small` is an empty or blank value, `too_big` a long one. */
export type FieldRefusal = 'required' | 'tooLong';

/**
 * The refused fields of a `validation_failed` answer, by field name. Empty when the body names none.
 * A field with several issues counts as the last one named.
 */
export function refusedFields(body: unknown): Record<string, FieldRefusal> {
  const issues = (body as { issues?: { path?: unknown; code?: unknown }[] } | null)?.issues;
  const refused: Record<string, FieldRefusal> = {};
  if (!Array.isArray(issues)) return refused;
  for (const { path, code } of issues) {
    if (typeof path === 'string') refused[path] = code === 'too_big' ? 'tooLong' : 'required';
  }
  return refused;
}
