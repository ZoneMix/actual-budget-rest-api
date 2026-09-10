/**
 * Jest configuration for testing with ESM support.
 */

export default {
  testEnvironment: 'node',
  transform: {},
  globals: {
    'jest': true,
  },
  moduleNameMapper: {
    '^@actual-app/api$': '<rootDir>/tests/mocks/actual-api.js',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/docs/**',
    '!src/public/**',
    '!src/server.js',
  ],
  // Ratchet: the largest multiple of 5 currently met by each metric.
  // Raise these as coverage grows; never lower them to make a run pass.
  //
  // Phase D (call-shape fixes) took the measured figures to
  // 55.99 stmts / 44.06 branches / 54.44 funcs / 55.63 lines and set
  // 55/40/50/55. The scope-enforcement phase adds the auth/scopes,
  // permissions, jwt, oauth2-scopes, route-scope, admin-auth, auth-refresh and
  // logger suites; re-measured on the merged codebase after the rebase.
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000,
  modulePathIgnorePatterns: ['<rootDir>/n8n-nodes-actual-budget-rest-api'],
};
