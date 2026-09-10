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
  // Phase D (call-shape fixes) took the measured figures from
  // 40/25/35/40 to 55.99 stmts / 44.06 branches / 54.44 funcs / 55.63 lines.
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 50,
      lines: 55,
      statements: 55,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000,
  modulePathIgnorePatterns: ['<rootDir>/n8n-nodes-actual-budget-rest-api'],
};

