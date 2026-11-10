// Writes docs/engineering/PRIVACY.md from the privacy registry (E014, AC25):
//   pnpm --filter @fivvi/domain generate:privacy
import { writeFileSync } from 'node:fs';
import { PRIVACY_INVENTORY_PATH, renderPrivacyInventory } from '../src/privacy/inventory.ts';
import { PRIVACY_REGISTRY } from '../src/privacy/registry.ts';
import { RETENTION } from '../src/privacy/retention.ts';

// The path is relative to src/privacy/inventory.ts; this script sits one level above src.
const target = new URL(
  PRIVACY_INVENTORY_PATH,
  new URL('../src/privacy/inventory.ts', import.meta.url),
);
writeFileSync(target, renderPrivacyInventory(PRIVACY_REGISTRY, RETENTION));
console.log(`Wrote ${target.pathname}`);
