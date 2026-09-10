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
  coverageThreshold: {
    global: {
      branches: 20,
      functions: 20,
      lines: 20,
      statements: 20,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000,
  modulePathIgnorePatterns: ['<rootDir>/n8n-nodes-actual-budget-rest-api'],
};

