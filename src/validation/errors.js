/**
 * Formats a ZodError into a flat, client-safe array of issues.
 *
 * Zod 4 renamed ZodError#errors to ZodError#issues; reading the old name
 * silently returned undefined, which collapsed every validation failure
 * into a single generic "unknown field" detail. This reads `issues` first
 * with an `errors` fallback (older Zod / zod-like error objects).
 */
export const formatZodError = (zodError) => {
  const issues = zodError?.issues ?? zodError?.errors ?? [];

  if (issues.length === 0) {
    return [{
      field: '(root)',
      message: zodError?.message || 'Validation failed',
      code: 'custom',
    }];
  }

  return issues.map((issue) => ({
    field: issue.path && issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message || 'Validation error',
    code: issue.code || 'custom',
  }));
};
