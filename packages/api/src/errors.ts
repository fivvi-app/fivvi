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

// The refusals of a route's access (E011). Machine-readable codes, no text: a client picks its
// own words. Which status a caller gets, and in what order, is in `access.ts`.

export const NotSignedInSchema = z
  .object({ code: z.enum(['not_signed_in']) })
  .openapi('NotSignedIn', {
    description: 'The request has no valid sign-in session. Contains no user-facing text.',
  });

export const NotFoundSchema = z.object({ code: z.enum(['not_found']) }).openapi('NotFound', {
  description:
    'The workspace or record does not exist or is out of the caller’s reach; the answer is the ' +
    'same for both. Contains no user-facing text.',
});

export const ForbiddenSchema = z.object({ code: z.enum(['forbidden']) }).openapi('Forbidden', {
  description:
    'The caller has a place in the workspace, but not the access this route needs. Contains no ' +
    'user-facing text.',
});

/** The body of the `401` of a route that needs a signed-in account. */
export const NOT_SIGNED_IN = { code: 'not_signed_in' } as const;
/** The body of the `404` for a workspace or record the caller can't reach. */
export const NOT_FOUND = { code: 'not_found' } as const;
/** The body of the `403` for a caller whose place in the workspace lacks the route's access. */
export const FORBIDDEN = { code: 'forbidden' } as const;
