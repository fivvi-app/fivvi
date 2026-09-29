// Regenerates openapi.json and the TS, Swift and Kotlin clients in place.
import { CONTRACT_ROOT, generateAll } from './pipeline.ts';

try {
  await generateAll(CONTRACT_ROOT, (step) => console.log(`Generating ${step}…`));
  console.log('Done. Commit the regenerated files together with the API change.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
