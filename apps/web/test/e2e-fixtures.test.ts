import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const e2eDir = path.resolve(import.meta.dirname, '../e2e');
const specs = readdirSync(e2eDir).filter((file) => file.endsWith('.spec.ts'));

// E013 AC9: the fixture that fails a test on a `securitypolicyviolation` is in `e2e/fixtures.ts`, so
// a spec that takes `test` from anywhere else would run without it.
describe('E013 AC9 every Playwright spec runs with the shared fixtures', () => {
  it('finds the specs', () => {
    expect(specs.length).toBeGreaterThan(10);
  });

  it.each(specs)('%s takes test from ./fixtures, not from Playwright', (spec) => {
    const source = readFileSync(path.join(e2eDir, spec), 'utf8');

    expect(source).toMatch(/import \{[^}]*\btest\b[^}]*\} from '\.\/fixtures';/);
    expect(source).not.toMatch(/import \{[^}]*\btest\b[^}]*\} from '@playwright\/test';/);
  });

  it('has the violation fixture automatic, so no spec has to ask for it', () => {
    const fixtures = readFileSync(path.join(e2eDir, 'fixtures.ts'), 'utf8');

    expect(fixtures).toMatch(/securitypolicyviolation/);
    expect(fixtures).toMatch(/cspViolations: \[[\s\S]*?\{ auto: true \},\s*\],\s*\}\);/);
  });
});
