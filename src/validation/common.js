/**
 * Small, reusable pieces shared by more than one domain schema file.
 */
import { z } from 'zod';
import { LOOKUP_TYPES } from './constants.js';

// Loose identifier accepted by most path params. Many documented API calls
// (and callers in this wrapper) use non-UUID ids, so this stays permissive.
export const IDSchema = z.object({
  id: z.string().min(1).max(255),
});

// Strict RFC 4122 UUID, used only where the SDK itself requires one.
export const UuidSchema = z.uuid();

// YYYY-MM budget month.
export const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format');

// YYYY-MM-DD calendar date — shared by transactions and schedules.
export const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

// z.coerce.boolean() is a trap here: Boolean('false') === true, so it would
// treat the literal query string "false" as truthy. Map the two accepted
// string spellings explicitly and let z.boolean() reject anything else.
const booleanFromQueryString = (value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

// A `?flag=true|false` query param coerced from string to boolean. Bare
// (not `.optional()`) so callers compose it: `BooleanQuerySchema.optional()`.
export const BooleanQuerySchema = z.preprocess(booleanFromQueryString, z.boolean());

// `?hidden=true|false` query param.
export const HiddenQuerySchema = z.object({
  hidden: BooleanQuerySchema.optional(),
});

// Name-based id lookup via the SDK's getIDByName(type, name). `type` is a
// closed union in the SDK, so an unlisted table is rejected here rather than
// forwarded to the engine.
export const LookupParamsSchema = z.object({
  type: z.enum(LOOKUP_TYPES),
  name: z.string().min(1).max(255),
});

export const AccountIdParamsSchema = z.object({
  accountId: UuidSchema,
});

export const PayeeIdParamsSchema = z.object({
  payeeId: UuidSchema,
});

/**
 * Every `fields`/update schema in this wrapper requires at least one key —
 * a partial update with nothing to update is a client error. Wrap the
 * object schema with this instead of repeating the refine inline.
 */
export const atLeastOneKey = (schema) => schema.refine(
  (obj) => Object.keys(obj).length > 0,
  { message: 'At least one field must be updated' }
);
