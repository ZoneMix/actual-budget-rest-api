/**
 * Note schemas.
 */
import { z } from 'zod';

export const UpdateNoteSchema = z.object({
  note: z.string().max(5000).nullable(),
});
