/**
 * Auth schemas — unchanged, just re-homed out of the monolithic file.
 */
import { z } from 'zod';

export const LoginSchema = z.object({
  username: z.string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens')
    .optional(),
  password: z.string().min(1).optional(),
  refresh_token: z.string().optional(),
}).refine(
  (data) => (data.username && data.password) || data.refresh_token,
  'Either username+password or refresh_token required'
);

export const LogoutSchema = z.object({
  refresh_token: z.string().optional(),
});
