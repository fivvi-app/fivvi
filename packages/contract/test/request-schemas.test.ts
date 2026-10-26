import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTRACT_ROOT, GENERATED_PATHS } from '../scripts/pipeline.ts';

// swift-openapi-generator turns `allOf: [{ $ref }, { description }]` into a payload struct
// (`LocalePayload(value1:value2:)`), so the apps would build a wrapper instead of the plain type
// (#223). A `$ref` field in a request body must stay a plain `$ref`; the description goes on the
// referenced component or the parent schema.

type Json = Record<string, unknown>;

const REF_PREFIX = '#/components/schemas/';

/** Paths (like `#/components/schemas/SignInRequest/properties/locale`) of every `allOf` that wraps a `$ref`. */
function findWrappedRefs(node: unknown, path: string, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((item, index) => {
      findWrappedRefs(item, `${path}/${index}`, found);
    });
  } else if (node !== null && typeof node === 'object') {
    const record = node as Json;
    const allOf = record.allOf;
    if (Array.isArray(allOf) && allOf.some((part) => isRef(part))) {
      found.push(path);
    }
    for (const [key, value] of Object.entries(record)) {
      findWrappedRefs(value, `${path}/${key}`, found);
    }
  }
  return found;
}

function isRef(node: unknown): boolean {
  return node !== null && typeof node === 'object' && '$ref' in node;
}

/** The schemas a request can carry: every request body and parameter, and what they reference. */
function requestSchemas(spec: Json): Json {
  const schemas = ((spec.components as Json | undefined)?.schemas ?? {}) as Json;
  const roots: Json = {};
  const paths = (spec.paths ?? {}) as Record<string, Record<string, Json>>;
  for (const [route, operations] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      if (operation.requestBody !== undefined) {
        roots[`#/paths/${route}/${method}/requestBody`] = operation.requestBody;
      }
      if (operation.parameters !== undefined) {
        roots[`#/paths/${route}/${method}/parameters`] = operation.parameters;
      }
    }
  }

  const reached: Json = { ...roots };
  const queue: unknown[] = Object.values(roots);
  while (queue.length > 0) {
    for (const ref of refsIn(queue.pop())) {
      const name = ref.slice(REF_PREFIX.length);
      const schemaPath = `${REF_PREFIX}${name}`;
      if (ref.startsWith(REF_PREFIX) && !(schemaPath in reached) && name in schemas) {
        reached[schemaPath] = schemas[name];
        queue.push(schemas[name]);
      }
    }
  }
  return reached;
}

function refsIn(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) refsIn(item, found);
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') found.push(value);
      else refsIn(value, found);
    }
  }
  return found;
}

function wrappedRefsInRequests(spec: Json): string[] {
  return Object.entries(requestSchemas(spec)).flatMap(([path, schema]) =>
    findWrappedRefs(schema, path),
  );
}

describe('E018 request schemas', () => {
  it('keeps a $ref field of a request a plain $ref, not wrapped in allOf', async () => {
    const spec = JSON.parse(
      await readFile(join(CONTRACT_ROOT, GENERATED_PATHS.spec), 'utf8'),
    ) as Json;

    expect(wrappedRefsInRequests(spec)).toEqual([]);
  });

  it('finds a $ref wrapped in allOf in a request body', () => {
    const spec = {
      paths: {
        '/v1/example': {
          post: {
            requestBody: {
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/ExampleRequest' } },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          ExampleRequest: {
            type: 'object',
            properties: {
              plain: { $ref: '#/components/schemas/Colour' },
              wrapped: {
                allOf: [
                  { $ref: '#/components/schemas/Colour' },
                  { description: 'A description that creates the wrapper.' },
                ],
              },
            },
          },
          Colour: { type: 'string', enum: ['red', 'blue'] },
        },
      },
    };

    expect(wrappedRefsInRequests(spec)).toEqual([
      '#/components/schemas/ExampleRequest/properties/wrapped',
    ]);
  });
});
