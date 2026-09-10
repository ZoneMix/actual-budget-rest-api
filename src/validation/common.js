/**
 * Small, reusable pieces shared by more than one domain schema file.
 */
import { z } from 'zod';

// Loose identifier accepted by most path params. Many documented API calls
// (and callers in this wrapper) use non-UUID ids, so this stays permissive.
export const IDSchema = z.object({
  id: z.string().min(1).max(255),
});

// Strict RFC 4122 UUID, used only where the SDK itself requires one.
export const UuidSchema = z.uuid();

// YYYY-MM budget month.
export const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format');

// z.coerce.boolean() is a trap here: Boolean('false') === true, so it would
// treat the literal query string "false" as truthy. Map the two accepted
// string spellings explicitly and let z.boolean() reject anything else.
const booleanFromQueryString = (value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

// `?hidden=true|false` query param, coerced from string to boolean.
export const HiddenQuerySchema = z.object({
  hidden: z.preprocess(booleanFromQueryString, z.boolean()).optional(),
});

// Generic name-based lookup (e.g. resolving an id via the SDK's getIDByName).
export const LookupParamsSchema = z.object({
  name: z.string().min(1).max(255),
});

export const AccountIdParamsSchema = z.object({
  accountId: UuidSchema,
});

export const PayeeIdParamsSchema = z.object({
  payeeId: UuidSchema,
});
