import openapiTS, { astToString, type OpenAPI3 } from 'openapi-typescript';

/** TypeScript types (`paths`, `components`, `operations`) for an OpenAPI document. */
export async function generateTypeScriptSchema(spec: OpenAPI3): Promise<string> {
  return astToString(await openapiTS(spec));
}
