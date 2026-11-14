// Preloaded with `node --import` by src/restore-startup.test.ts: prints the URL of every module the process resolves,
// one `resolved <url>` line each on stderr, so the test can say what a script loads at start-up.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    process.stderr.write(`resolved ${resolved.url}\n`);
    return resolved;
  },
});
