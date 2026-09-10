/**
 * Account group schemas.
 */
import { z } from 'zod';

export const CreateAccountGroupSchema = z.object({
  group: z.object({
    name: z.string().min(1).max(255),
  }),
});

export const UpdateAccountGroupSchema = z.object({
  fields: z.object({
    name: z.string().min(1).max(255).optional(),
  }).refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field must be updated' }),
});
