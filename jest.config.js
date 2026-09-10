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
  // (Merged from main's post-Phase-C ratchet and the Phase E validation
  // rewrite's own — functions took the higher of the two per-branch values,
  // 35 vs 30; re-verified against the combined codebase's actual coverage.)
  coverageThreshold: {
    global: {
      branches: 25,
      functions: 35,
      lines: 40,
      statements: 40,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000,
  modulePathIgnorePatterns: ['<rootDir>/n8n-nodes-actual-budget-rest-api'],
};

