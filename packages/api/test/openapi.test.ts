import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../src/index.ts';

describe('The OpenAPI document', () => {
  it('names the API Fivvi API', () => {
    expect(buildOpenApiDocument().info.title).toBe('Fivvi API');
  });
});
