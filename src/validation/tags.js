/**
 * Tag schemas.
 */
import { z } from 'zod';
import { atLeastOneKey } from './common.js';

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
  fields: atLeastOneKey(z.object({
    tag: tagValue.optional(),
    color: colorValue.optional(),
    description: descriptionValue.optional(),
  })),
});
