import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../src/index.ts';

describe('The OpenAPI document', () => {
  it('names the API Fivvi API', () => {
    expect(buildOpenApiDocument().info.title).toBe('Fivvi API');
  });

  describe('F001N AC16: native sign-in', () => {
    const document = buildOpenApiDocument();

    it('has the three native sign-in routes with their operation IDs', () => {
      const operations = {
        'POST /v1/sign-in/request': document.paths?.['/v1/sign-in/request']?.post?.operationId,
        'POST /v1/sign-in/token': document.paths?.['/v1/sign-in/token']?.post?.operationId,
        'POST /v1/sign-out': document.paths?.['/v1/sign-out']?.post?.operationId,
      };

      expect(operations).toEqual({
        'POST /v1/sign-in/request': 'requestSignIn',
        'POST /v1/sign-in/token': 'exchangeSignInCode',
        'POST /v1/sign-out': 'signOut',
      });
    });

    it('declares the cookie and the bearer security schemes', () => {
      expect(document.components?.securitySchemes).toMatchObject({
        cookieAuth: { type: 'apiKey', in: 'cookie' },
        bearerAuth: { type: 'http', scheme: 'bearer' },
      });
    });

    it('lets GET /v1/me use either, and sign-out only the bearer token', () => {
      expect(document.paths?.['/v1/me']?.get?.security).toEqual([
        { cookieAuth: [] },
        { bearerAuth: [] },
      ]);
      expect(document.paths?.['/v1/sign-out']?.post?.security).toEqual([{ bearerAuth: [] }]);
    });

    it('answers a request with 202 and an empty body, and documents the 400', () => {
      const responses = document.paths?.['/v1/sign-in/request']?.post?.responses;

      expect(Object.keys(responses ?? {})).toEqual(['202', '400', '500']);
      expect(responses?.['202']).not.toHaveProperty('content');
    });
  });
});
