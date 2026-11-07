/** Joins class names, leaving out the ones that are not set. */
export function classes(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
