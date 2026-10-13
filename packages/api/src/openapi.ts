import type { OpenAPIHono } from '@hono/zod-openapi';
import { API_BASE_PATH, createApp } from './app.ts';

export type OpenApiDocument = ReturnType<OpenAPIHono['getOpenAPI31Document']>;

/** The OpenAPI 3.1 document for `app`. packages/contract commits it as openapi.json. */
export function buildOpenApiDocument(app: OpenAPIHono = createApp()): OpenApiDocument {
  return app.getOpenAPI31Document({
    openapi: '3.1.0',
    info: { title: 'Trainer Hub API', version: '0.1.0' },
    servers: [{ url: API_BASE_PATH }],
  });
}
