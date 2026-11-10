import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const turbo = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../turbo.json'), 'utf8'),
) as {
  extends?: string[];
  tasks?: Record<string, { inputs?: string[] }>;
};

// The web app renders docs/legal when it is built (F064, AC10). Turbo caches the build and the tests
// by their inputs, so without these two entries a changed legal text would reuse a cached result and
// an open `{{…}}` value would pass. This test runs whenever apps/web changes, which is when the file
// could lose them.
describe('F064 AC10 the legal texts are inputs of the web build and tests (turbo)', () => {
  it('extends the root configuration, so the other tasks and packages stay as they are', () => {
    expect(turbo.extends).toEqual(['//']);
  });

  const legal = [
    '$TURBO_DEFAULT$',
    '$TURBO_ROOT$/docs/legal/privacy-policy.*.md',
    '$TURBO_ROOT$/docs/legal/terms.*.md',
  ];

  it('lists the privacy policy and the terms as inputs of the build', () => {
    expect(turbo.tasks?.build?.inputs).toEqual(legal);
  });

  // #697: the tests also read the sub-processors list, the processor agreement, the registry of features and the brand files.
  it('lists them, and the other files of docs/ the tests read, as inputs of the tests', () => {
    expect(turbo.tasks?.test?.inputs).toEqual([
      ...legal,
      '$TURBO_ROOT$/docs/legal/sub-processors.md',
      '$TURBO_ROOT$/docs/legal/verwerkersovereenkomst.md',
      '$TURBO_ROOT$/docs/product/FEATURES.md',
      '$TURBO_ROOT$/docs/design/brand/*.svg',
    ]);
  });
});
