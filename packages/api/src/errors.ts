import { z } from '@hono/zod-openapi';

export const ValidationErrorSchema = z
  .object({
    code: z.enum(['validation_failed']),
    issues: z.array(
      z.object({
        path: z.string().openapi({ description: 'Dot-separated path of the invalid field.' }),
        code: z.string().openapi({ description: 'Machine-readable issue code.' }),
      }),
    ),
  })
  .openapi('ValidationError', {
    description: 'The request did not match the contract. Contains no user-facing text.',
  });

/** The `400` a route with input documents. */
export const validationErrorResponse = {
  description: 'The request did not match the contract.',
  content: { 'application/json': { schema: ValidationErrorSchema } },
};

export type ValidationError = z.infer<typeof ValidationErrorSchema>;

export function toValidationError(error: z.ZodError): ValidationError {
  return {
    code: 'validation_failed',
    issues: error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      code: issue.code,
    })),
  };
}

/** The body of every unhandled error's 500: no stack trace, no internal message (E009). */
export const INTERNAL_SERVER_ERROR = 'Internal Server Error';

/**
 * The `500` a route documents when it can fail on the server side. `createApp`'s error handler
 * sends it.
 */
export const internalServerErrorResponse = {
  description: 'Unexpected server error, reported to error tracking. Contains no error details.',
  content: {
    'text/plain': { schema: z.string().openapi({ example: INTERNAL_SERVER_ERROR }) },
  },
};

export const UnauthorizedSchema = z
  .object({ code: z.enum(['unauthorized']) })
  .openapi('Unauthorized', {
    description: 'The request has no valid sign-in session. Contains no user-facing text.',
  });

/** The `401` a route documents, with what makes it happen in `description`. */
export const unauthorizedResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: UnauthorizedSchema } },
});

/** The body of every `401`: it never says whether a token, a code or an address was wrong. */
export const UNAUTHORIZED = { code: 'unauthorized' } as const;
