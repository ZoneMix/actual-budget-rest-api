/**
 * Payee schemas.
 */
import { z } from 'zod';
import { UuidSchema } from './common.js';

export const CreatePayeeSchema = z.object({
  payee: z.object({
    name: z.string().min(1).max(255),
  }),
});

export const UpdatePayeeSchema = z.object({
  fields: z.object({
    name: z.string().min(1).max(255).optional(),
  }).refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field must be updated' }),
});

export const MergePayeesSchema = z.object({
  targetId: UuidSchema,
  mergeIds: z.array(UuidSchema).min(1),
});
