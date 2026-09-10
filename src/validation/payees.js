/**
 * Payee schemas.
 */
import { z } from 'zod';
import { UuidSchema, atLeastOneKey } from './common.js';

export const CreatePayeeSchema = z.object({
  payee: z.object({
    name: z.string().min(1).max(255),
  }),
});

export const UpdatePayeeSchema = z.object({
  fields: atLeastOneKey(z.object({
    name: z.string().min(1).max(255).optional(),
  })),
});

export const MergePayeesSchema = z.object({
  targetId: UuidSchema,
  mergeIds: z.array(UuidSchema).min(1),
});
