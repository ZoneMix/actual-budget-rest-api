/**
 * Category group schemas.
 */
import { z } from 'zod';
import { DeleteCategoryQuerySchema } from './categories.js';

export const CreateCategoryGroupSchema = z.object({
  group: z.object({
    name: z.string().min(1).max(255),
    is_income: z.boolean().optional(),
    hidden: z.boolean().optional(),
  }),
});

export const UpdateCategoryGroupSchema = z.object({
  fields: z.object({
    name: z.string().min(1).max(255).optional(),
    is_income: z.boolean().optional(),
    hidden: z.boolean().optional(),
  }).refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field must be updated' }),
});

// Re-exported (not redefined) from categories.js — see the comment there.
export { DeleteCategoryQuerySchema };
