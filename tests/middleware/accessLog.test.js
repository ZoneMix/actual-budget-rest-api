/**
 * The access log line every request produces.
 *
 * It logged `req.originalUrl`, which carries the query string — and the query
 * string is where credentials show up: the OAuth authorize redirect, a
 * `?token=` on a link someone pasted, a password in a mistyped GET. Access logs
 * are shipped and retained, so the path alone is what belongs there.
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import request from 'supertest';
import { buildTestApp } from '../helpers/app.js';
import logger from '../../src/logging/logger.js';

/** The 'Request completed' access-log call, or undefined if none was made. */
const accessLogEntry = (spy) =>
  spy.mock.calls.find(([message]) => message === 'Request completed')?.[1];

describe('access log', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records the path without the query string', async () => {
    const spy = jest.spyOn(logger, 'info').mockImplementation(() => logger);
    const app = buildTestApp();

    await request(app).get('/v2/health?token=super-secret-value&page=2');

    const meta = accessLogEntry(spy);
    expect(meta).toBeDefined();
    expect(meta.url).toBe('/v2/health');
    expect(JSON.stringify(meta)).not.toContain('super-secret-value');
    expect(JSON.stringify(meta)).not.toContain('token=');
  });

  it('keeps the full mounted path, not just the segment the router saw', async () => {
    const spy = jest.spyOn(logger, 'info').mockImplementation(() => logger);
    const app = buildTestApp();

    await request(app).get('/v2/accounts?secret=leaky');

    const meta = accessLogEntry(spy);
    expect(meta.url).toBe('/v2/accounts');
    expect(JSON.stringify(meta)).not.toContain('leaky');
  });

  it('still records the method, status and request id', async () => {
    const spy = jest.spyOn(logger, 'info').mockImplementation(() => logger);
    const app = buildTestApp();

    await request(app).get('/v2/health');

    const meta = accessLogEntry(spy);
    expect(meta.method).toBe('GET');
    expect(typeof meta.status).toBe('number');
    expect(meta.requestId).toBeDefined();
  });
});
