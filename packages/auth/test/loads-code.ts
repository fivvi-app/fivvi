// Type-only imports and re-exports vanish at run time; everything else loads code.
export const loadsCode = (source: string): boolean => {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return /^\s*import\b(?!\s+type\b)|^\s*export\s*(?:\{[^}]*\}|\*(?:\s+as\s+\w+)?)\s*from\b|\bimport\s*\(|\brequire\s*\(/m.test(
    code,
  );
};
