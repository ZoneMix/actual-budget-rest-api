/**
 * Backward-compatible shim.
 *
 * The real schemas and validateBody/validateParams/validateQuery factories
 * now live under src/validation/ (one file per domain — see that directory
 * for accounts, transactions, rules, etc.). Routes still import from this
 * path; do not add new schemas here.
 */
export * from '../validation/index.js';
