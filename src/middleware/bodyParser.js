/**
 * Route-specific body parser configurations.
 *
 * Provides different body size limits for different route types:
 * - Standard routes: 50kb (default)
 * - Bulk operations: 1mb (transactions, imports)
 * - Query endpoint: 10kb (queries are small)
 */

import express from 'express';
import { MAX_REQUEST_SIZE } from '../config/index.js';

/**
 * Standard body parser for most routes.
 * 50kb limit - sufficient for most CRUD operations.
 */
export const standardBodyParser = express.json({ limit: '50kb' });
export const standardUrlParser = express.urlencoded({ limit: '50kb', extended: true });

/**
 * Bulk operation body parser.
 * 1mb limit - for bulk transaction imports/adds.
 */
export const bulkBodyParser = express.json({ limit: '1mb' });
export const bulkUrlParser = express.urlencoded({ limit: '1mb', extended: true });

/**
 * Query body parser.
 * 10kb limit - queries are small JSON objects.
 */
export const queryBodyParser = express.json({ limit: '10kb' });

/**
 * Default body parser (uses configured MAX_REQUEST_SIZE).
 */
export const defaultBodyParser = express.json({ limit: MAX_REQUEST_SIZE });
export const defaultUrlParser = express.urlencoded({ limit: MAX_REQUEST_SIZE, extended: true });

