// Lighthouse's own computation of the `benchmarkIndex` (the number it reports in
// `lhr.environment.benchmarkIndex`), which its package does not type. It runs in the page.
declare module 'lighthouse/core/lib/page-functions.js' {
  export const pageFunctions: { computeBenchmarkIndex: () => number };
}
