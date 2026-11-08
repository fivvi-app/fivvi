import type { RateLimitRule } from '@fivvi/database';
import { type OpenAPIHono, z } from '@hono/zod-openapi';
import { defineRoute } from '../access.ts';
import type { ApiDependencies } from '../dependencies.ts';
import { internalServerErrorResponse, validationErrorResponse } from '../errors.ts';
import { LocaleSchema } from '../schemas.ts';

// The demo request of the public website (F064, spec #611, ADR-030): one email to Fivvi's own
// support address and nothing else. Nothing is stored (the rate limit counts requests under a
// keyed hash of the client address and keeps no answer) and nothing about the visitor is logged.
// No email goes to the visitor, so the form cannot be used to send mail to someone else. A
// honeypot field and two rate limits keep bots from filling the inbox.

/** Demo requests per client IP address per hour: a person sends one, maybe two after a typo. */
const IP_LIMIT: RateLimitRule = { max: 5, windowMinutes: 60 };

/**
 * Demo requests from everyone per hour: a backstop for a flood from many addresses (a botnet),
 * far above what real interest in a pilot sends.
 */
const ALL_LIMIT: RateLimitRule = { max: 60, windowMinutes: 60 };

const NameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  // The name is in the email's subject: no line breaks or other control characters.
  .regex(/^[^\p{Cc}\p{Zl}\p{Zp}]*$/u)
  .openapi({ description: 'The visitor’s name: 1 to 100 characters, on one line.' });

const DemoRequestSchema = z
  .object({
    name: NameSchema,
    email: z
      .email()
      .max(254)
      .openapi({ description: 'The address to answer. No email is sent to it by this request.' }),
    businessKind: z.enum(['gym', 'studio', 'personal-trainer']).openapi({
      description: 'The kind of business: a gym with a team, a pilates or yoga studio, or a PT.',
    }),
    trainerCount: z.enum(['one', 'two-to-four', 'five-or-more']).openapi({
      description: 'How many trainers the business has.',
    }),
    message: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .openapi({ description: 'What the visitor would most like to see: up to 2000 characters.' }),
    locale: LocaleSchema,
    website: z
      .string()
      .max(2000)
      .optional()
      .openapi({
        description:
          'A honeypot: the form hides this field from people. Leave it empty or out. A request that ' +
          'fills it is dropped without an email, and gets the same answer as any other.',
      }),
  })
  .openapi('DemoRequest', {
    description:
      'A visitor’s request for a demo. `locale` is the language of the page they used, which the ' +
      'answer follows.',
  });

const RateLimitedSchema = z
  .object({ code: z.enum(['rate_limited']) })
  .openapi('DemoRequestRateLimited', {
    description: 'Too many demo requests from this network, or from everyone, in the last hour.',
  });

const UnavailableSchema = z
  .object({ code: z.enum(['unavailable']) })
  .openapi('DemoRequestUnavailable', {
    description:
      'The email could not be sent. Nothing was stored; the visitor may try again later or write ' +
      'to the support address. Contains no user-facing text.',
  });

const requestDemoRoute = defineRoute(
  {
    method: 'post',
    path: '/v1/demo-requests',
    operationId: 'requestDemo',
    tags: ['demo-requests'],
    summary: 'Ask for a demo',
    description:
      'Sends one email with the answers to Fivvi’s support address. Nothing is stored and nothing ' +
      'about the visitor is logged; no email goes to the visitor. `400` names the invalid fields. ' +
      'A request that fills the `website` honeypot gets the `202` of any other and sends nothing. ' +
      '`429` after 5 requests from one network in an hour, or 60 from everyone. `503` when the ' +
      'email could not be sent.',
    request: {
      body: { required: true, content: { 'application/json': { schema: DemoRequestSchema } } },
    },
    responses: {
      202: { description: 'Accepted. The body is empty.' },
      400: validationErrorResponse,
      429: {
        description: 'Too many requests. Try again later.',
        content: { 'application/json': { schema: RateLimitedSchema } },
      },
      500: internalServerErrorResponse,
      503: {
        description: 'The email could not be sent.',
        content: { 'application/json': { schema: UnavailableSchema } },
      },
    },
  },
  { type: 'public' },
);

export function registerDemoRequests(app: OpenAPIHono, dependencies: ApiDependencies) {
  app.openapi(requestDemoRoute, async (c) => {
    const { website, message, ...answers } = c.req.valid('json');
    // A bot fills every field. It gets the answer of a real request and costs nothing.
    if (website?.trim()) return c.body(null, 202);

    // After the validation: a refused request uses nothing up. The keys hold no address: the
    // client's is a keyed hash, IPv6 grouped by /64 (`clientAddressKey`, as for sign-in). Without
    // a usable address, behind the proxy that always sets one (`NODE_ENV=production`) the request
    // shares one bucket; elsewhere (local, tests) the key is `null`: no per-address limit, only
    // the one for all.
    const clientKey = dependencies.clientAddressKey(c.req.raw.headers);
    const limited: string[] = [];
    if (clientKey !== null) {
      const { allowed } = await dependencies.consumeRateLimit(
        `demo-request:ip:${clientKey}`,
        IP_LIMIT,
      );
      if (!allowed) limited.push('ip');
    }
    // A request over its own limit does not use up the one for everyone.
    if (limited.length === 0) {
      const everyone = await dependencies.consumeRateLimit('demo-request:all', ALL_LIMIT);
      if (!everyone.allowed) limited.push('all');
    }
    // The counters of windows that have ended go (one indexed range delete), as at sign-in.
    await dependencies.deleteExpiredRateLimits();
    if (limited.length > 0) {
      // Which limit and nothing else: no address, no answer.
      console.warn(`Demo request rate-limited: ${limited.join(', ')}`);
      return c.json({ code: 'rate_limited' as const }, 429);
    }

    try {
      await dependencies.sendDemoRequest({ ...answers, message: message || null });
    } catch (error) {
      // The error names the provider and a status, never the visitor (`EmailSendError`); the log
      // gets only its name, as for any unhandled error.
      console.error('Demo request not sent:', error instanceof Error ? error.name : 'Error');
      dependencies.errorReporter.captureError(error, {
        request: c.req.raw,
        route: c.req.routePath,
      });
      return c.json({ code: 'unavailable' as const }, 503);
    }
    return c.body(null, 202);
  });
}
