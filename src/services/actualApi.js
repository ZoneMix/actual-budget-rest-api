/**
 * Actual Budget service layer.
 *
 * The implementation lives in `./actual/`, split by domain behind an engine
 * queue and a sync policy. This module stays as the import path every route
 * already uses.
 */

export * from './actual/index.js';
