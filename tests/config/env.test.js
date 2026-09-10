/**
 * Validated environment configuration.
 *
 * Zod 4 trap being pinned here: `.default()` short-circuits parsing and must
 * already be the OUTPUT type. `z.string().transform(Number).pipe(...)
 * .default('3000')` therefore yields the STRING '3000' when the variable is
 * unset — the transform never runs. Every default in env.js must be written
 * in the type the rest of the app expects to read.
 */

import env from '../../src/config/env.js';
import {
  PORT,
  ACTUAL_QUERY_MAX_RESULTS,
  ACTUAL_QUERY_MAX_FILTER_DEPTH,
} from '../../src/config/index.js';

// tests/setup.js sets no PORT / ACTUAL_QUERY_* values, so every assertion
// below is exercising the schema default rather than a parsed string.
describe('config/env defaults', () => {
  it('leaves PORT unset in the test environment', () => {
    expect(process.env.PORT).toBeUndefined();
  });

  it('defaults PORT to the number 3000, not the string', () => {
    expect(typeof env.PORT).toBe('number');
    expect(env.PORT).toBe(3000);
  });

  it.each([
    ['ENABLE_CORS'],
    ['ENABLE_HELMET'],
    ['ENABLE_RATE_LIMITING'],
  ])('defaults %s to a real boolean', (name) => {
    expect(typeof env[name]).toBe('boolean');
    expect(env[name]).toBe(true);
  });

  it('defaults the ActualQL result cap to the number 10000', () => {
    expect(typeof env.ACTUAL_QUERY_MAX_RESULTS).toBe('number');
    expect(env.ACTUAL_QUERY_MAX_RESULTS).toBe(10000);
  });

  it('defaults the ActualQL filter-depth cap to the number 5', () => {
    expect(typeof env.ACTUAL_QUERY_MAX_FILTER_DEPTH).toBe('number');
    expect(env.ACTUAL_QUERY_MAX_FILTER_DEPTH).toBe(5);
  });

  it('keeps the engine queue defaults numeric too', () => {
    expect(typeof env.ACTUAL_QUEUE_MAX_DEPTH).toBe('number');
    expect(typeof env.ACTUAL_OP_TIMEOUT_MS).toBe('number');
    expect(typeof env.ACTUAL_SYNC_MIN_INTERVAL_MS).toBe('number');
  });

  it('re-exports the query caps through config/index.js unchanged', () => {
    expect(PORT).toBe(env.PORT);
    expect(ACTUAL_QUERY_MAX_RESULTS).toBe(10000);
    expect(ACTUAL_QUERY_MAX_FILTER_DEPTH).toBe(5);
  });
});
