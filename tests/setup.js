/**
 * Jest test setup file.
 * Runs before all tests to configure the test environment.
 */

import { jest } from '@jest/globals';

// Make jest available globally
global.jest = jest;
global.expect = (await import('@jest/globals')).expect;
global.describe = (await import('@jest/globals')).describe;
global.it = (await import('@jest/globals')).it;
global.beforeEach = (await import('@jest/globals')).beforeEach;

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-characters-long';
process.env.ADMIN_PASSWORD = 'TestPassword123!';
process.env.ACTUAL_SERVER_URL = 'http://localhost:5006';
process.env.ACTUAL_PASSWORD = 'test';
process.env.ACTUAL_SYNC_ID = 'test-sync-id';
process.env.DATA_DIR = './tests/data';
process.env.SESSION_SECRET = 'test-session-secret-32-characters-long';

