/**
 * Server-level information about the Actual instance the engine talks to.
 * Mounted at /v2/server.
 */
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { requireScopeByMethod } from '../auth/permissions.js';
import { serverVersion } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { BadGatewayError } from '../errors/index.js';
import { sendSuccess } from '../middleware/responseHelpers.js';

const router = express.Router();
router.use(authenticateJWT, requireScopeByMethod());

/**
 * `getServerVersion()` resolves a union: `{ version }`, or
 * `{ error: 'no-server' | 'network-failure' }` when the Actual server cannot
 * be reached. The failure arm is an upstream problem — the request was valid
 * and the wrapper is healthy — so it maps to 502, not 500 or 4xx.
 */
router.get('/version', asyncHandler(async (req, res) => {
  const result = await serverVersion();

  if (!result || result.error) {
    throw new BadGatewayError(
      `Actual server version unavailable: ${result?.error ?? 'no response from engine'}`
    );
  }

  sendSuccess(res, { version: result.version });
}));

export default router;
