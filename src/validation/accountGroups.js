/**
 * Account group schemas.
 */
import { z } from 'zod';
import { atLeastOneKey } from './common.js';

export const CreateAccountGroupSchema = z.object({
  group: z.object({
    name: z.string().min(1).max(255),
  }),
});

export const UpdateAccountGroupSchema = z.object({
  fields: atLeastOneKey(z.object({
    name: z.string().min(1).max(255).optional(),
  })),
});
