/**
 * ActualQL Query endpoint.
 *
 * Allows executing read-only ActualQL queries against Actual Budget data.
 * Queries are validated and restricted for security:
 * - Only whitelisted tables are allowed
 * - Filter depth and complexity are limited
 * - Results are truncated to prevent resource exhaustion
 * - All queries are logged for audit purposes
 *
 * @see https://actualbudget.org/docs/api/actual-ql/ for ActualQL documentation
 */

import express from 'express';
import { authenticateJWT } from '../auth/jwt.js';
import { runActualQuery } from '../services/actualApi.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validateBody } from '../middleware/validation-schemas.js';
import { QuerySchema } from '../middleware/validation-schemas.js';
import { queryLimiter } from '../middleware/rateLimiters.js';
import { secureQueryMiddleware, limitQueryResults } from '../middleware/querySecurity.js';
import { sendSuccess } from '../middleware/responseHelpers.js';
import { queryBodyParser } from '../middleware/bodyParser.js';
import logger from '../logging/logger.js';

const router = express.Router();
router.use(authenticateJWT);
router.use(queryBodyParser); // Smaller limit for queries

router.post(
  '/',
  queryLimiter,
  validateBody(QuerySchema),
  secureQueryMiddleware,
  asyncHandler(async (req, res) => {
    const { query } = req.validatedBody;
    
    try {
      // Execute query through Actual API
      const result = await runActualQuery(query);
      
      // Limit results to prevent resource exhaustion
      const limitedResult = limitQueryResults(result);
      
      sendSuccess(res, { 
        result: limitedResult,
        truncated: Array.isArray(result) && result.length > limitedResult.length,
      });
    } catch (error) {
      // Sanitize query object for logging (don't log full filter data which may contain sensitive info)
      const sanitizedQuery = {
        table: query.table,
        hasFilter: !!query.filter,
        hasSelect: !!query.select,
        selectType: Array.isArray(query.select) ? 'array' : typeof query.select,
        selectCount: Array.isArray(query.select) ? query.select.length : null,
        options: query.options,
      };
      
      logger.error('ActualQL query execution failed', {
        requestId: req.id,
        userId: req.user?.user_id,
        query: sanitizedQuery,
        error: error.message,
      });
      throw error;
    }
  })
);

export default router;