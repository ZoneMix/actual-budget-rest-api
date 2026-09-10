/**
 * Test helper: build a fresh Express app instance for supertest.
 */

import { createApp } from '../../src/app.js';

/**
 * Builds a new Express app instance wired exactly like production.
 * Call once per test (or per describe block) to get an isolated app.
 */
export const buildTestApp = () => createApp();

/**
 * Builds an Authorization header object for supertest's `.set()`.
 */
export const bearer = (token) => ({ Authorization: `Bearer ${token}` });
