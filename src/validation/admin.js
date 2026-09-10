/**
 * Admin OAuth client schemas.
 */
import { z } from 'zod';
import { SCOPES } from './constants.js';

const splitCommaScopes = (value) => (
  typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : value
);

const AllowedScopesSchema = z.preprocess(splitCommaScopes, z.array(z.enum(SCOPES)));

export const CreateClientSchema = z.object({
  client_id: z.string().min(1).max(255),
  client_secret: z.string().min(32).optional(),
  allowed_scopes: AllowedScopesSchema.default(['api']),
  redirect_uris: z.union([
    z.string(),
    z.array(z.string().url()),
  ]).optional().default(''),
});

export const UpdateClientSchema = z.object({
  client_secret: z.string().min(32).optional(),
  allowed_scopes: AllowedScopesSchema.optional(),
  redirect_uris: z.union([
    z.string(),
    z.array(z.string().url()),
  ]).optional(),
}).refine((obj) => Object.keys(obj).length > 0, {
  message: 'At least one field must be updated',
});

export const ClientIdParamsSchema = z.object({
  clientId: z.string().min(1).max(255),
});
