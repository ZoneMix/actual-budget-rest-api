/**
 * Budget-file endpoints, mounted at /v2/budget (singular — /v2/budgets is the
 * budget-month router).
 *
 * Listing is an ordinary read. Loading and exporting are admin-only through
 * `requireAdminRole()` rather than `requireScope(SCOPES.ADMIN)`: loading swaps
 * the open budget for the whole process and exporting hands out the entire
 * ledger, so neither may fall through under the shipped `warn` enforcement
 * mode, where a scope denial only logs. `requireAdminRole()` always enforces.
 */
import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { requireScopeByMethod, requireAdminRole } from '../auth/permissions.js';
import { budgetFilesList, budgetLoad, budgetExport } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { standardBodyParser } from '../middleware/bodyParser.js';
import { validateBody } from '../middleware/validation-schemas.js';
import { LoadBudgetSchema } from '../middleware/validation-schemas.js';
import { adminLimiter } from '../middleware/rateLimiters.js';
import { sendSuccess } from '../middleware/responseHelpers.js';
import { InternalServerError } from '../errors/index.js';

// An export is a file download, not a JSON envelope: base64 in JSON would
// inflate the whole ledger by a third and force the client to decode it.
const EXPORT_CONTENT_TYPE = 'application/zip';
const EXPORT_FILENAME_PREFIX = 'actual-budget-';
const EXPORT_FILENAME_SUFFIX = '.zip';

/** `actual-budget-YYYY-MM-DD.zip`, dated in UTC so it does not depend on TZ. */
const exportFilename = () =>
  `${EXPORT_FILENAME_PREFIX}${new Date().toISOString().slice(0, 10)}${EXPORT_FILENAME_SUFFIX}`;

const router = express.Router();
router.use(authenticateJWT, requireScopeByMethod());
router.use(standardBodyParser);

router.get('/files', asyncHandler(async (req, res) => {
  const files = await budgetFilesList();
  sendSuccess(res, { files });
}));

router.post(
  '/load',
  requireAdminRole(),
  adminLimiter,
  validateBody(LoadBudgetSchema),
  asyncHandler(async (req, res) => {
    const { budgetId } = req.validatedBody;
    await budgetLoad(budgetId);
    sendSuccess(res, { budgetId });
  })
);

router.post(
  '/export',
  requireAdminRole(),
  adminLimiter,
  asyncHandler(async (req, res) => {
    const bytes = await budgetExport();

    // Checked BEFORE any header is set, so a failure renders as a JSON error
    // rather than an error body labelled application/zip. `Buffer.from(
    // undefined)` would otherwise surface as an opaque ERR_INVALID_ARG_TYPE,
    // and a zero-length result is worse still: a 200 with an empty archive
    // that looks like a successful backup until someone tries to restore it.
    if (!bytes || bytes.length === 0) {
      throw new InternalServerError('Budget export produced no data');
    }

    res.setHeader('Content-Type', EXPORT_CONTENT_TYPE);
    res.setHeader('Content-Disposition', `attachment; filename="${exportFilename()}"`);
    res.end(Buffer.from(bytes));
  })
);

export default router;
