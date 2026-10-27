import { type OpenAPIHono, z } from '@hono/zod-openapi';
import { defineRoute } from '../access.ts';
import type { ApiDependencies } from '../dependencies.ts';
import {
  internalServerErrorResponse,
  UNAUTHORIZED,
  unauthorizedResponse,
  validationErrorResponse,
} from '../errors.ts';
import { LocaleSchema } from '../schemas.ts';

// The sign-in routes of the native apps (spec #168, ADR-004, ADR-007). Each is a thin layer over
// `packages/auth`, which runs the web's sign-in: the same verification, EM-08 email, allowlist
// and rate limits. Better Auth's own endpoints stay outside the contract.

const EmailSchema = z.email().openapi({ description: 'The address the account signs in with.' });

// `locale` stays a bare `LocaleSchema`: a description on the property makes zod-openapi emit
// `allOf: [{ $ref }, { description }]`, which swift-openapi-generator turns into a payload struct
// (#223). Its description lives on the object instead.
const SignInRequestSchema = z
  .object({
    email: EmailSchema,
    locale: LocaleSchema,
  })
  .openapi('SignInRequest', {
    description:
      'Asks for the sign-in email. `locale` is the interface language the app resolved; the email follows ADR-019.',
  });

const SignInTokenRequestSchema = z
  .object({
    email: EmailSchema,
    code: z
      .string()
      .regex(/^\d{6}$/)
      .openapi({ description: 'The 6-digit code in the email.' }),
  })
  .openapi('SignInTokenRequest');

export const SignInTokenResponseSchema = z
  .object({
    token: z.string().openapi({
      description:
        'The bearer token: a sign-in session, valid 30 days after its last use and renewed ' +
        'on use. Send it as `Authorization: Bearer <token>`.',
    }),
  })
  .openapi('SignInTokenResponse');

const requestSignInRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/sign-in/request',
    operationId: 'requestSignIn',
    tags: ['sign-in'],
    summary: 'Ask for a sign-in email',
    description:
      'Sends the sign-in email (EM-08, a link and a 6-digit code) to an account or an allowed ' +
      'address. The answer is the same for every address and for a request over the rate limits, ' +
      'so it never says who has an account.',
    request: {
      body: { required: true, content: { 'application/json': { schema: SignInRequestSchema } } },
    },
    responses: {
      202: { description: 'Accepted. The body is empty.' },
      400: validationErrorResponse,
      500: internalServerErrorResponse,
    },
  },
  { type: 'public' },
);

const exchangeSignInCodeRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/sign-in/token',
    operationId: 'exchangeSignInCode',
    tags: ['sign-in'],
    summary: 'Exchange the emailed code for a bearer token',
    description:
      'Uses up the verification of the email (the web’s link and code are the same one), creates ' +
      'the account at the first sign-in of an allowed address, and returns a bearer token. ' +
      'It sets no cookie. Every failure gets the same 401.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: SignInTokenRequestSchema } },
      },
    },
    responses: {
      200: {
        description: 'The bearer token.',
        content: { 'application/json': { schema: SignInTokenResponseSchema } },
      },
      400: validationErrorResponse,
      401: unauthorizedResponse(
        'The code was not accepted. Nothing says why: it can be wrong, used, replaced, expired or ' +
          'out of attempts, or this network asked too often.',
      ),
      500: internalServerErrorResponse,
    },
  },
  { type: 'public' },
);

const signOutRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/sign-out',
    operationId: 'signOut',
    tags: ['sign-in'],
    summary: 'Sign out',
    description:
      'Ends the sign-in session of the bearer token in the request, and only that one. ' +
      'Other phones and browsers of the account stay signed in.',
    security: [{ bearerAuth: [] }],
    responses: {
      204: { description: 'The sign-in session has ended. The body is empty.' },
      401: unauthorizedResponse('No valid bearer token.'),
      500: internalServerErrorResponse,
    },
  },
  { type: 'public' },
);

export function registerSignIn(app: OpenAPIHono, dependencies: ApiDependencies) {
  app.openapi(requestSignInRoute, async (c) => {
    const { email, locale } = c.req.valid('json');
    await dependencies.requestSignIn({ email, locale, headers: c.req.raw.headers });
    return c.body(null, 202);
  });

  app.openapi(exchangeSignInCodeRoute, async (c) => {
    const { email, code } = c.req.valid('json');
    const token = await dependencies.exchangeSignInCode({
      email,
      code,
      headers: c.req.raw.headers,
    });
    if (!token) return c.json(UNAUTHORIZED, 401);
    return c.json({ token }, 200);
  });

  app.openapi(signOutRoute, async (c) => {
    if (!(await dependencies.signOutBearer(c.req.raw.headers))) return c.json(UNAUTHORIZED, 401);
    return c.body(null, 204);
  });
}
