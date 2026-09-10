/**
 * Route-specific body parser configurations.
 *
 * Every router that reads a body mounts EXACTLY ONE of these. There is no
 * app-wide `express.json()`: body-parser marks a request with `req._body` once
 * it has read it and every later parser then bails out (body-parser
 * lib/read.js), so a global parser silently demotes each per-router limit to
 * its own. Mounting one parser per router is what keeps the limits below real.
 *
 * - Standard routes: MAX_REQUEST_SIZE (10 kb default)
 * - Bulk operations: 1 mb (transaction imports, the 500-operation budget batch)
 * - Query endpoint:  10 kb (an ActualQL query is a small JSON object)
 */

import express from 'express';
import { MAX_REQUEST_SIZE } from '../config/index.js';

/**
 * Standard body parser for ordinary CRUD routes.
 * Honours MAX_REQUEST_SIZE so the documented knob actually governs them.
 */
export const standardBodyParser = express.json({ limit: MAX_REQUEST_SIZE });
export const standardUrlParser = express.urlencoded({ limit: MAX_REQUEST_SIZE, extended: true });

/**
 * Bulk operation body parser.
 * 1mb limit - for bulk transaction imports/adds and POST /v2/budgets/batch.
 */
export const bulkBodyParser = express.json({ limit: '1mb' });
export const bulkUrlParser = express.urlencoded({ limit: '1mb', extended: true });

/**
 * Query body parser.
 * 10kb limit - queries are small JSON objects.
 */
export const queryBodyParser = express.json({ limit: '10kb' });
