/**
 * Category schemas.
 */
import { z } from 'zod';
import { atLeastOneKey } from './common.js';

export const CreateCategorySchema = z.object({
  category: z.object({
    name: z.string().min(1).max(255),
    group_id: z.string().optional(),
    hidden: z.boolean().optional(),
  }),
});

export const UpdateCategorySchema = z.object({
  fields: atLeastOneKey(z.object({
    name: z.string().min(1).max(255).optional(),
    group_id: z.string().optional(),
    hidden: z.boolean().optional(),
  })),
});

// Shared by both the category and category-group delete endpoints — defined
// once here and re-exported from categoryGroups.js so there is a single
// canonical schema (re-exporting the same name from two `export *` sources
// would make it ambiguous and drop it from src/validation/index.js).
export const DeleteCategoryQuerySchema = z.object({
  transferCategoryId: z.string().optional(),
});
