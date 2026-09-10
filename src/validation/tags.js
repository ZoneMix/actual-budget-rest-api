/**
 * Tag schemas.
 */
import { z } from 'zod';

const tagValue = z.string().min(1).max(255);
const colorValue = z.string().nullable();
const descriptionValue = z.string().nullable();

export const CreateTagSchema = z.object({
  tag: z.object({
    tag: tagValue,
    color: colorValue.optional(),
    description: descriptionValue.optional(),
  }),
});

export const UpdateTagSchema = z.object({
  fields: z.object({
    tag: tagValue.optional(),
    color: colorValue.optional(),
    description: descriptionValue.optional(),
  }).refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field must be updated' }),
});
