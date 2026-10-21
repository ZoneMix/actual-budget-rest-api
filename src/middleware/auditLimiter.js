/**
 * Rate limiter for GET /v1/audit/changes, with its own counter.
 *
 * Kept apart from the shared limiters in rateLimiters.js (past this repo's
 * line cap) so audit polling and n8n write bursts never spend each other's
 * budget. Each request is a full-day scan holding the engine queue slot, so
 * the ceiling sits well below the general-purpose read limiters.
 */

import rateLimit from 'express-rate-limit';

export const AUDIT_RATE_WINDOW_MS = 60 * 1000;
export const AUDIT_RATE_MAX = 30;

export const auditLimiter = rateLimit({
  windowMs: AUDIT_RATE_WINDOW_MS,
  max: AUDIT_RATE_MAX,
  message: { error: 'Too many audit requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
