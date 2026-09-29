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
