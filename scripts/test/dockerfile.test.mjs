import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = join(import.meta.dirname, '../..');

/** The Dockerfile's stages by name, each with its parent (a stage name or an image) and its instructions. */
function dockerStages(dockerfile) {
  const stages = new Map();
  let stage;
  for (const line of dockerfile.replace(/\\\n/g, ' ').split('\n')) {
    const instruction = line.trim();
    if (instruction === '' || instruction.startsWith('#')) continue;
    const from = instruction.match(/^FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i);
    if (from) {
      stage = { name: from[2] ?? `#${stages.size}`, parent: from[1], instructions: [] };
      stages.set(stage.name, stage);
    } else if (stage) {
      stage.instructions.push(instruction);
    }
  }
  return stages;
}

/** The stage and every stage it builds on, nearest first. */
function lineage(stages, name) {
  const chain = [];
  for (let stage = stages.get(name); stage; stage = stages.get(stage.parent)) chain.push(stage);
  return chain;
}

const installsCaCertificates = (instruction) =>
  /^RUN\b/.test(instruction) &&
  /apt-get install\b/.test(instruction) &&
  /\bca-certificates\b/.test(instruction);

describe('E009 the Docker image', () => {
  const stages = dockerStages(readFileSync(join(ROOT, 'Dockerfile'), 'utf8'));
  const webBuild = readFileSync(join(ROOT, 'apps/web/package.json'), 'utf8');
  const buildStage = [...stages.values()].find((stage) =>
    stage.instructions.some((instruction) =>
      /^RUN pnpm --filter @fivvi\/web build\b/.test(instruction),
    ),
  );

  it('builds the web app in a stage, and that build publishes the source maps', () => {
    assert.ok(buildStage, 'no stage runs pnpm --filter @fivvi/web build');
    assert.match(webBuild, /"build": "[^"]*node scripts\/publish-source-maps\.ts/);
  });

  it('#87: the stage that uploads the source maps has CA certificates, from apt without extras', () => {
    const installs = lineage(stages, buildStage.name)
      .flatMap((stage) => stage.instructions)
      .filter(installsCaCertificates);
    assert.equal(
      installs.length,
      1,
      `sentry-cli (OpenSSL) can't verify Sentry's certificate: no stage up to "${buildStage.name}" installs ca-certificates`,
    );
    assert.match(installs[0], /--no-install-recommends/);
    assert.match(installs[0], /rm -rf \/var\/lib\/apt\/lists\/\*/);
  });

  it('#87: keeps the runtime image without apt packages (Node verifies TLS with its bundled CAs)', () => {
    const runtime = stages.get('runtime');
    assert.ok(runtime, 'no runtime stage');
    assert.deepEqual(
      lineage(stages, 'runtime')
        .flatMap((stage) => stage.instructions)
        .filter((instruction) => /apt-get/.test(instruction)),
      [],
    );
  });
});
